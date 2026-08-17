# Phase 4A: native PowerSync connection foundation

## Status

Implemented locally on 2026-07-20. Automated native connection-layer tests and the local Android debug build pass, and the project-specific `EXPO_PUBLIC_POWERSYNC_URL` is configured. Installation of the rebuilt development client and the authenticated connection smoke test remain required before Phase 4A is operationally complete.

## Problem

Phase 3 established an optional persistent Supabase account, but the application had no PowerSync client. Connecting synchronization and replacing the existing local repositories in one change would risk hiding the user's current device vocabulary before the approved guest-import workflow exists.

Phase 4A therefore establishes only the authenticated native synchronization transport. Existing `wordfold.sqlite` data remains authoritative and visible until a later import phase is separately specified and approved.

## Implemented behavior

- Signed-out users continue using the existing Expo SQLite repositories without a network requirement.
- A configured, signed-in native client connects to PowerSync using the current Supabase access token.
- PowerSync owns one separate `wordfold-sync.sqlite` database with client tables matching the deployed Sync Streams.
- The connector does not upload application writes in this phase. An unexpected queued write is left unacknowledged and reported as an implementation error.
- Connection state is exposed to Account and Settings without claiming that local vocabulary has been uploaded.
- Explicit sign-out disconnects and clears PowerSync before the Supabase session is cleared.
- A signed-out launch also clears stale synchronized data left by an interrupted sign-out.
- Account transitions are serialized so connection and clearing cannot overlap.
- Web uses a no-op provider and retains the existing preview data behavior.
- Missing or invalid PowerSync configuration does not prevent local application startup.

## Client configuration

The native application requires this public build-time value:

```dotenv
EXPO_PUBLIC_POWERSYNC_URL=https://your-instance.powersync.com
```

The endpoint is centralized and replaceable; it is not embedded in repository operations. HTTPS is required except for `localhost` and `127.0.0.1` development endpoints. Supabase access tokens are read from the existing authenticated session. Replication credentials, database passwords, and PowerSync administration tokens are never bundled into the application.

## Files and modules

- `src/data/sync/config.ts`: public endpoint validation.
- `src/data/sync/schema.ts`: PowerSync client schema for collections, words, and learning events.
- `src/data/sync/database.ts`: the single native PowerSync database instance.
- `src/data/sync/connector.ts`: Supabase credentials and upload guard.
- `src/data/sync/lifecycle.ts`: serialized account connection and clearing.
- `src/providers/sync-provider.tsx`: native lifecycle and status context.
- `src/providers/sync-provider.web.tsx`: web-safe no-op context.
- `src/providers/sync-types.ts`: provider contract.
- `src/app/_layout.tsx`, `src/app/account.tsx`, and `src/app/settings.tsx`: provider wiring, status copy, and safe sign-out.

## Data and API changes

- No Supabase or Postgres migration.
- No migration or mutation of `wordfold.sqlite`.
- No change to the `AppDataProvider` contract.
- New native dependencies: `@powersync/react-native` and `@journeyapps/react-native-quick-sqlite`.
- New internal sync context: phase, completed-sync state, last sync time, safe message, and `clearBeforeSignOut()`.

## Edge cases

- Missing, malformed, or insecure remote endpoint.
- Application starts while signed out with stale synchronized rows on disk.
- Network is unavailable during initial connection or after a completed download.
- Supabase has no current session when PowerSync requests credentials.
- Sign-out is requested while connection initialization is in progress.
- Clearing fails: Supabase sign-out is not attempted, avoiding an account-data isolation failure.
- A different account follows the current account: the old database is cleared before connecting the new account.

## Explicitly deferred

- Guest vocabulary import and stable legacy-to-UUID mappings.
- Switching screens or repositories to PowerSync data.
- PowerSync upload processing and Supabase Data API/RPC writes.
- Conflict handling and multi-device restore validation.
- Web data synchronization and background synchronization.

## Acceptance criteria

- Signed-out local behavior and existing data are unchanged.
- A configured signed-in native client can complete an authenticated PowerSync download.
- Account and Settings report transport status without claiming vocabulary upload.
- PowerSync data is cleared before explicit Supabase sign-out.
- Configuration, credentials, lifecycle, and UI tests pass.
- TypeScript, lint, all tests, Expo Doctor, and a local Expo export are checked.
- Adding the native adapter requires a rebuilt development client. EAS remains quota-limited and is not run without separate approval.

## Next phase

Phase 4B and Phase 4C are approved and implemented locally under their dedicated specifications. Native authenticated import, offline/reconnect, and second-device verification remain deferred.
