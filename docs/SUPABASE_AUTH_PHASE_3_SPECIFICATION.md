# Phase 3: Supabase authentication specification

## Status

Implemented locally. Automated tests, type checking, lint, and local Expo export pass. Remote authentication configuration and the native email-confirmation smoke test remain pending because the app does not yet have the development project's publishable key or an approved redirect-setting change.

This phase adds an optional Supabase email/password account to Wordfold. It does not connect the application data repositories to PowerSync yet. Phase 4 will add synchronized application data after authentication is independently working and tested.

The agreed product boundary is:

- email and password authentication only;
- email confirmation remains enabled;
- signed-out users continue to use the complete local guest experience;
- OAuth, magic links, password-reset UI, account deletion, guest-data import, and data synchronization are deferred.

This document is subordinate to the approved [Supabase and PowerSync specification](SUPABASE_POWERSYNC_SPECIFICATION.md) and uses the deployed development Supabase project and PowerSync foundation described in [the initial setup runbook](SUPABASE_POWERSYNC_INITIAL_SETUP.md).

Official references used for this phase:

- [Supabase React Native authentication quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Expo SDK 56 SecureStore](https://docs.expo.dev/versions/v56.0.0/sdk/securestore/)
- [Expo environment variables](https://docs.expo.dev/guides/environment-variables/)

## Problem being solved

The database and PowerSync service are ready, but the Expo application has no user session boundary. It always starts in the local experience, has no Supabase client, and Settings explicitly says that accounts do not exist.

Phase 3 must establish a reliable account session that later phases can use for Row Level Security and PowerSync JWT authorization without making account availability or network access a requirement for opening or using the application.

## Expected behavior

### Guest and startup behavior

- A user who has never signed in enters the existing app exactly as today.
- No sign-in screen is forced during startup or onboarding.
- Authentication initialization reads persisted state locally and does not wait for a successful network request before rendering the existing app.
- Missing public Supabase configuration or an unavailable network must not crash or block the guest experience. The account screen reports that account services are unavailable while local features remain usable.
- Guest data continues to use the existing `wordfold.sqlite` repositories. Signing in during this phase does not upload, move, merge, hide, or delete any local data.

### Account entry point

- Settings gains one **Account and sync** card.
- Signed out, the card says that an account can be created or used to sign in, while making clear that cloud data synchronization is not active until the next phase.
- Signed in, the card shows the confirmed account email and links to account management.
- The stale Settings statement that no account system exists is replaced with accurate copy: local data remains device-only during Phase 3 even when an account is signed in.
- The card opens a new modal `/account` route. The same route serves signed-out, confirmation-pending, and signed-in states so no auth-only navigation tree is required.

### Sign in

- The signed-out account screen defaults to **Sign in**.
- The form contains email and password fields, appropriate keyboard/autocomplete/content-type hints, disabled/loading submit state, and an accessible error message.
- Email is trimmed and lowercased before submission.
- Empty/invalid email and empty password are rejected locally. Supabase remains authoritative for credential validity.
- The form calls `supabase.auth.signInWithPassword`.
- A successful session updates the account UI immediately and persists across application restarts.
- Invalid credentials, offline failures, rate limits, and server failures leave the user signed out and present a safe, actionable message. Passwords and auth tokens are never logged.

### Create account and confirm email

- The account screen can switch from **Sign in** to **Create account** without adding another route.
- Account creation requires email, password, and password confirmation.
- The client requires at least eight password characters and matching password fields. Supabase remains authoritative for any stronger server policy.
- The form calls `supabase.auth.signUp` with an account-screen redirect generated from the existing `wordfold` application scheme.
- With email confirmation enabled, a successful request with no session changes the screen to a **Check your email** state. It does not falsely describe the user as signed in.
- The Supabase project must allow the `wordfold://account` redirect before the remote smoke test.
- The app handles both a cold-start confirmation callback and a callback received while already running. It accepts only the expected account callback, extracts the access and refresh tokens, and calls `supabase.auth.setSession`.
- Callback tokens are neither logged nor retained outside the Supabase session store. Missing tokens and Supabase callback errors result in a safe message and do not affect guest data.
- If the email is confirmed in a browser or on another device, the user can return and sign in normally with email/password.

The custom scheme is sufficient for development and the first native implementation. Universal/app links are a later release-hardening option and are not required in this phase.

### Session lifecycle

- The Supabase client enables persisted sessions, automatic token refresh, disables browser URL detection in React Native, and uses Supabase's React Native lock integration.
- Native session storage uses `@react-native-async-storage/async-storage`, matching Supabase's current React Native guidance.
- Automatic refresh runs only while the application is active and stops in the background.
- Auth state changes update one root `AuthProvider`; feature screens do not register their own competing session listeners.
- A refresh failure while offline does not erase local vocabulary or block local usage. The last session state may remain visible until Supabase can refresh or explicitly reports sign-out.
- Sign out uses `supabase.auth.signOut({ scope: 'local' })`, so signing out this device does not unexpectedly sign out other devices.
- Because PowerSync is not connected in Phase 3, sign out only clears the Supabase session. The stricter Phase 4 sequence—disconnect and clear the user-specific PowerSync database before clearing auth—remains mandatory when sync is introduced.

### Platform behavior

- The account route and Supabase authentication compile on native and web.
- Web authentication does not imply web data synchronization; the existing in-memory web data provider remains unchanged and the UI states that synchronization is not active.
- Native confirmation-link testing uses the existing custom development build. Expo Go is not an acceptance gate for this callback because its development URL differs from the registered `wordfold` scheme.

## Minimal architecture

```text
RootLayout
  `-- AuthProvider
        |-- persisted Supabase session
        |-- one auth-state listener
        |-- one AppState refresh listener
        `-- AppDataProvider
              `-- existing local repositories (unchanged in Phase 3)

Settings -> /account -> sign in / create account / confirmation / sign out
Email confirmation -> wordfold://account -> AuthProvider -> setSession
```

The auth provider wraps the current data provider, but no data-provider decision depends on auth until Phase 4. This is deliberately the smallest seam that exposes a stable Supabase session without rewriting existing repositories.

## Files and modules to change

The implementation is expected to make only these targeted changes:

| File/module | Approved responsibility |
| --- | --- |
| `package.json`, `pnpm-lock.yaml` | Add `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, and `react-native-url-polyfill`. Versions will be resolved with Expo-compatible installation at implementation time. |
| `.env.example` | Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` placeholders. Existing infrastructure-secret placeholders remain non-public. |
| Local ignored `.env` | Add the development Supabase URL and publishable key when available. Database passwords, service-role keys, and replication credentials must never use the `EXPO_PUBLIC_` prefix. |
| `src/data/supabase/client.ts` | Initialize the single Supabase client, native storage, URL polyfill, lock, refresh, persistence, and missing-configuration handling. |
| `src/data/supabase/auth-callback.ts` | Parse and validate only the expected email-confirmation callback and establish its Supabase session. |
| `src/providers/auth-provider.tsx` | Own initial-session loading, auth subscription, AppState refresh, callback handling, and typed sign-in/sign-up/sign-out actions. |
| `src/app/_layout.tsx` | Add `AuthProvider` above `AppDataProvider` and register the account modal. Authentication must not become part of the root launch-readiness gate. |
| `src/app/account.tsx` | Add the account UI for signed-out, confirmation-pending, signed-in, loading, and error states using existing `Screen`, `AppText`, `FormField`, `PrimaryButton`, theme, and spacing conventions. |
| `src/app/settings.tsx` | Add the account entry card/status and correct the Phase 3 privacy/sync wording. Existing reminder and learning-preference behavior remains unchanged. |
| Focused test files beside the modules above | Cover provider lifecycle, callback parsing, form validation/submission, confirmation state, sign-out scope, and Settings account status. |

`app.json` already registers the `wordfold` scheme and therefore should not need a native configuration change. If implementation reveals that a configuration change is required, work pauses for a specification amendment rather than silently expanding scope.

## Public configuration and security decisions

The app receives only:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-with-public-publishable-key
```

Expo embeds every `EXPO_PUBLIC_` value in the application bundle. The Supabase URL and publishable key are intentionally public; RLS is the security boundary. The service-role key, database password, PowerSync replication password, and PowerSync admin token remain server/infrastructure secrets.

### Why AsyncStorage rather than SecureStore

Supabase's React Native quickstart uses AsyncStorage for its serialized session. Expo SecureStore encrypts values, but its SDK 56 documentation warns that large payloads may be rejected and notes historical iOS failures above roughly 2 KB. A Supabase serialized session can exceed that size. Implementing chunking, recovery, and cross-platform keychain edge cases would add a new custom credential-storage subsystem to this phase.

The minimal approved implementation therefore uses AsyncStorage inside the operating system's application sandbox. This means the persisted session is not separately encrypted by Wordfold. The accepted Phase 3 threat model excludes a rooted, jailbroken, or otherwise compromised device. A separately specified hardening phase may replace the storage adapter after measuring real session sizes and defining migration/failure behavior.

## Remote configuration and data changes

### Required Supabase configuration

Before remote testing:

1. Email/password signups must be enabled.
2. **Confirm email** must remain enabled.
3. `wordfold://account` must be added to the allowed Auth redirect URLs.
4. The application must receive the project's public publishable key.

Any dashboard or Management API mutation is a separate execution step and requires confirmation immediately before it is performed.

Supabase's default email service is suitable only for development and is rate-limited/best-effort. Custom SMTP is recommended before production, but configuring it is outside Phase 3.

### Database and PowerSync changes

- No Postgres schema migration is added.
- No `auth.users` profile mirror table is added.
- Existing RLS policies, replication role, publication, Sync Streams, and PowerSync Cloud deployment remain unchanged.
- No PowerSync client dependency or local synchronized database is added in this phase.
- Creating a Supabase Auth user may create an `auth.users` row remotely, but it must not create, import, or mutate Wordfold application rows yet.

## API and type changes

The new internal `AuthProvider` exposes a small typed interface equivalent to:

```ts
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'unavailable';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signIn(email: string, password: string): Promise<AuthActionResult>;
  signUp(email: string, password: string): Promise<AuthActionResult>;
  signOut(): Promise<AuthActionResult>;
};
```

`AuthActionResult` is a local discriminated result used by the UI to represent success, confirmation-required, and safe failure states. Screens do not catch raw Supabase exceptions or inspect undocumented error strings for control flow.

No existing repository interface, domain entity, SQLite schema, route parameter, or exported application-data context value changes in Phase 3.

## Edge cases

- First launch has no network and no persisted session.
- First launch has a persisted session but token refresh cannot reach Supabase.
- Supabase public configuration is absent or malformed.
- The user submits invalid email, an empty password, a short signup password, or mismatched confirmation.
- Sign-in credentials are invalid without revealing whether the email exists.
- Signup succeeds but requires email confirmation and returns no session.
- Signup is retried for an already registered address.
- The confirmation link opens the app from a terminated state or while it is running.
- A callback is malformed, contains an auth error, omits a token, has an unexpected route, or is delivered twice.
- The session changes while the account screen is open.
- The app moves repeatedly between foreground and background without accumulating refresh listeners.
- The user signs out offline or Supabase rejects sign-out.
- Signing in or out must not change current local word, collection, learning-event, preference, onboarding, or reminder rows.
- Web sign-in must not claim that local preview data is synchronized.

## Risks and assumptions

- Phase 3 proves identity and session lifecycle, not end-to-end data recovery. A signed-in account cannot restore vocabulary on another device until Phase 4.
- AsyncStorage relies on the platform application sandbox and is weaker against a compromised device than keychain/keystore-backed storage.
- Custom-scheme links can be claimed by another installed app. Universal/app links should be considered before a public security-sensitive release.
- Supabase's development email delivery limits can make repeated confirmation testing unreliable; this is not an application-code failure.
- The server's password policy may become stricter than the client-side eight-character check. Server errors remain authoritative and visible in safe form.
- The development Supabase URL is environment-specific. A later self-hosting move changes public configuration and may require users to authenticate again.
- The existing `wordfold` scheme and Expo Router behavior are assumed to map the confirmation callback to `/account`; this will be verified in the local development build before the phase is considered complete.

## Explicitly not changed

- Existing guest SQLite schema, repositories, content, and UUID/import strategy.
- PowerSync client integration, upload queue, connector, synchronization schema, or conflict handling.
- Guest-data merge/import UX.
- Dashboard statistics or learning algorithm.
- Reminder scheduling and notification identifiers.
- WordNet and downloadable content libraries.
- OAuth providers, magic links, OTP, password reset, MFA, anonymous Supabase users, account deletion, or profile editing.
- Global sign-out across other devices.
- Production custom SMTP, universal links, EAS builds, app-store submission, or self-hosting.
- Web data synchronization.

## Verification plan

Implementation verification follows the repository's quota-safe order:

1. Focused Jest tests for the Supabase client adapter, auth callback, provider, account UI, and Settings state.
2. Full `pnpm test`.
3. `pnpm typecheck`.
4. `pnpm lint`.
5. Expo Doctor.
6. Local Expo export.
7. Manual native development-build smoke test for signup, confirmation callback, restart persistence, sign-in, local sign-out, offline startup, and unchanged guest data.

No EAS cloud build is authorized by this specification. A remote EAS build would consume limited quota and requires explicit approval immediately before running it.

## Minimal acceptance criteria

- The app still opens and remains usable as a guest with no account, no Supabase configuration, or no network.
- Settings opens the account modal and accurately states that data synchronization is not active yet.
- A user can create an email/password account and receives a clear confirmation-required state.
- A valid `wordfold://account` email-confirmation callback establishes and persists the Supabase session without exposing tokens.
- A confirmed user can sign in, restart the app while remaining signed in, and sign out only the current device.
- Auth refresh lifecycle follows foreground/background state without duplicate listeners.
- Invalid credentials, network failures, malformed callbacks, and missing configuration produce safe UI errors without changing guest data.
- Signing in and out leaves all existing local words, learning history, preferences, onboarding state, and reminders unchanged.
- No database migration or PowerSync deployment is created by Phase 3.
- Focused tests, the full test suite, type checking, lint, Expo Doctor, and local export pass, with any environment-limited manual check reported explicitly.

## Approval checkpoint

Approval of this document authorizes only the Phase 3 code and test changes described above. Implementation will stop again before any required Supabase dashboard mutation, native remote build, Phase 4 PowerSync integration, or other scope expansion.
