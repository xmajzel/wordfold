# Phase 4B: resumable guest vocabulary import

## Status

Approved and implemented locally on 2026-07-20. All 30 test suites (109 tests), lint, TypeScript, the local Expo export, and the local Android debug build pass. Expo Doctor reports 19/21 checks with two pre-existing dependency metadata advisories. A live authenticated import and interruption/recovery scenarios remain unverified until a native test device is available.

Phase 4A is implemented, but its authenticated physical-device smoke test is deferred because a test device is not currently available. Phase 4B may be implemented locally, but neither phase is release-verified until native testing is completed.

## Problem

Signing in currently connects a separate PowerSync database while all visible vocabulary remains in `wordfold.sqlite`. Existing device data cannot be moved to the account safely because local collection and word IDs are non-UUID strings, local learning-event IDs are integers, retries have no durable checkpoint, and the account may already contain a word with the same normalized term.

Phase 4B imports device vocabulary into the signed-in Supabase account without switching application reads or ordinary writes away from `wordfold.sqlite`.

## Expected behavior

### Eligibility and consent

- Import is available only on native platforms when the user is signed in and PowerSync has completed a download.
- Account shows an explicit **Import device vocabulary** action when the current account has not completed an import from this installation.
- Opening the action shows local collection, word, and learning-event counts before any remote write.
- No import begins without the user's explicit confirmation.
- A completed import marker is scoped to the Supabase user ID. A different account receives a separate prompt and separate mappings.
- With no importable device data, the screen reports that there is nothing to import and performs no remote write.

### Durable preparation and resume

- `wordfold.sqlite` is migrated from schema version 4 to 5.
- A local `sync_imports` row stores the account ID, state, timestamps, progress counts, and a safe last-error code/message.
- A local `sync_id_mappings` table maps `(account_id, entity_type, local_id)` to one remote UUID and optionally records a conflict resolution.
- Confirmation fixes the import plan by creating mapping rows for the local entity IDs in that snapshot. Entities created afterward are not silently added without new consent.
- Collection, word, and learning-event UUIDs are created with Expo Crypto UUIDv4 and persisted before their corresponding remote write.
- Each accepted entity records the source `updated_at` (or event timestamp) that was imported so Phase 4C can detect later device changes before switching repositories.
- Retrying or reopening reuses persisted mappings and idempotently resumes the incomplete step.
- Only one import operation may run at a time in the app process.
- Sign-out first requests import cancellation and waits for the current network operation to settle before PowerSync clearing and Supabase sign-out begin.

### Conflict review

- Preflight reads the account's active words through authenticated Supabase RLS and compares `normalized_term` values.
- Every duplicate normalized term is shown before upload and requires one explicit choice:
  - **Keep account version:** do not change the account word and do not import that local word's learning events.
  - **Use this device version:** reuse the account word UUID, update its mutable content, collection, and current progress from the device, then import its learning events.
- A duplicate is never silently overwritten and cannot be imported as a second active word because the server schema forbids that state.
- Conflict choices and the selected remote word UUID are persisted so resume does not ask again unless the server changed and invalidated the choice.

### Upload and verification

- The import service uses the existing authenticated Supabase client directly; Phase 4A's general PowerSync CRUD uploader remains disabled.
- Upload order is collections, words, then learning events.
- New collections and words use UUID-keyed authenticated upserts. Updates selected by **Use this device version** omit immutable `id`, `user_id`, and `created_at` fields.
- Learning events use insert-on-conflict-do-nothing semantics because they are append-only and the authenticated role has no update grant.
- Writes use bounded batches and preserve the local progress checkpoint after each accepted batch.
- Transient network/authentication failures leave the import resumable and show a retry action.
- Validation, ownership, or schema failures stop the import and show a safe error; they are never marked complete or silently discarded.
- After Supabase accepts every row, the service waits for a later PowerSync download and queries `wordfold-sync.sqlite` for every expected remote UUID.
- Counts and representative mapped IDs must match before the local import is marked complete.
- A verification timeout leaves the import in a resumable `verifying` state; it does not report success.
- The original guest collections, words, events, settings, and mappings remain in `wordfold.sqlite` after success.
- Completion copy states that the confirmed snapshot was imported, but continuous synchronization will not begin until Phase 4C. Device changes made afterward remain local.

### UI states

The native import screen has these explicit states:

- summary and confirmation;
- checking account data;
- conflict review;
- uploading with collection/word/event progress;
- waiting for PowerSync verification;
- completed;
- retryable error.

Closing the screen never cancels or rolls back already accepted writes. Reopening reconstructs progress from the local import record.

## Files and modules likely to change

- `package.json` and `pnpm-lock.yaml`: add the Expo SDK 56-compatible `expo-crypto` dependency.
- `src/data/database.ts`: version 5 migration for import records and mappings.
- `src/data/database.test.ts`: migration coverage.
- `src/data/sync/guest-import-repository.ts`: read-only guest snapshot and local import-journal operations using the existing SQLite connection.
- `src/data/sync/guest-import-repository.test.ts`: snapshot, mapping, and checkpoint tests.
- `src/data/sync/guest-import-types.ts`: persistent and UI import contracts.
- `src/data/sync/guest-import.ts`: preflight, conflict planning, ordered Supabase writes, resume, and PowerSync verification.
- `src/data/sync/guest-import.test.ts`: idempotency, ordering, conflict, retry, and verification tests.
- `src/data/sync/guest-import-remote.ts` and its test: paginated authenticated Supabase reads and bounded writes.
- `src/providers/app-data-provider.tsx`: expose native import state/actions while reusing the already-open `wordfold.sqlite` connection and existing serial mutation queue.
- `src/providers/app-data-provider.web.tsx`: expose an unavailable/no-op import contract so the web preview remains buildable.
- `src/app/account-import.tsx`: native import summary, conflict choices, progress, retry, and completion UI.
- `src/app/account.tsx` and `src/app/_layout.tsx`: entry point and route registration.
- Focused provider/screen tests and the Supabase/PowerSync setup documentation.

No unrelated repository refactor was included.

## Data model changes

Local-only tables in `wordfold.sqlite`:

```sql
create table sync_imports (
  account_id text primary key not null,
  state text not null,
  collections_total integer not null default 0,
  collections_uploaded integer not null default 0,
  words_total integer not null default 0,
  words_uploaded integer not null default 0,
  events_total integer not null default 0,
  events_uploaded integer not null default 0,
  error_code text,
  error_message text,
  started_at text,
  updated_at text not null,
  completed_at text
);

create table sync_id_mappings (
  account_id text not null,
  entity_type text not null,
  local_id text not null,
  remote_id text not null,
  has_conflict integer not null default 0,
  conflict_resolution text,
  source_updated_at text,
  created_at text not null,
  primary key (account_id, entity_type, local_id),
  unique (account_id, entity_type, remote_id)
);
```

Allowed import states are `prepared`, `needs_conflicts`, `uploading`, `verifying`, `completed`, and `error`. Allowed entity types are `collection`, `word`, and `learning_event`. Allowed conflict resolutions are `keep_account` and `use_device`.

No Supabase/Postgres migration and no PowerSync schema or Sync Streams change are planned.

## API and contract changes

The application data context gains a guest-import view model and these native actions:

- prepare or resume the current account's import;
- persist a conflict choice;
- start/resume upload;
- retry verification;
- refresh the import state.
- pause and await an active import before sign-out.

The contract exposes only safe display state and counts to UI. Supabase clients, SQLite handles, access tokens, and raw backend errors are not exposed to screens.

## Edge cases

- App termination after mappings are created but before the first write.
- App termination between collection, word, and event batches.
- A retry after Supabase accepted a batch but before its checkpoint was stored.
- Local data being added or edited after the user confirmed the import snapshot.
- Session expiration during preflight, upload, or verification.
- PowerSync or Supabase being reachable while the other service is unavailable.
- Account data changing after conflict preflight.
- Multiple local events referencing a conflicting word.
- Notification-open events with no word ID.
- A different account signing in on the same installation.
- Sign-out while an import operation is running: the operation is aborted or paused and awaited before synchronized-data clearing; accepted checkpoints remain resumable and completion is not fabricated.
- A PowerSync verification timeout after all Supabase writes succeeded.

## Risks and assumptions

- Phase 4A's native connection is assumed for implementation but remains manually unverified.
- Importing potentially large histories through bounded Data API batches is adequate for the current personal vocabulary scale. A server-side bulk RPC is deferred unless measured limits require one.
- **Use this device version** intentionally replaces the account word's mutable content and current progress. **Keep account version** intentionally omits the device history for that conflicting word to avoid inconsistent counters.
- The server remains authoritative after accepting writes; Postgres may assign a newer `updated_at` during conflict updates.
- Sync Streams are currently beta according to PowerSync's feature status, so release verification must include interruption and recovery scenarios.

## Explicitly not changed

- Ordinary signed-in reads and writes do not switch to PowerSync yet.
- Device changes made after the confirmed import snapshot are not claimed to be synchronized; Phase 4C must import the recorded delta before repository cutover.
- The general PowerSync `PUT`, `PATCH`, and `DELETE` uploader remains disabled.
- Guest rows are not deleted, hidden, or rewritten after import.
- Reminder settings, learning preferences, onboarding metadata, scheduled notifications, and catalog data are not synchronized.
- No automatic import on sign-in.
- No background import while the UI has never received consent.
- No web synchronization or web import.
- No CRDT field semantics, shared collections, or collaboration.
- No EAS build.

## Minimal acceptance criteria

- Version 4 guest databases migrate without modifying existing vocabulary or history.
- Each local entity receives one stable per-account UUID reused by every retry.
- Nothing is uploaded before explicit confirmation and conflict resolution.
- Imports always write collections before words and words before events.
- Duplicate normalized terms require and obey the documented per-word choice.
- Interrupted and repeated imports do not create duplicate server rows or events.
- Import success is reported only after expected UUIDs are visible in the PowerSync database.
- Failed verification is retryable and preserves guest data.
- Completed imports do not prompt again for the same account.
- The imported source timestamps remain available so Phase 4C can identify post-import device changes before cutover.
- A different account cannot reuse another account's mappings or completion marker.
- Existing signed-out behavior, local vocabulary UI, and safe sign-out remain unchanged.
- Focused tests, the full test suite, lint, TypeScript, Expo Doctor, and local exports pass.
- Native device scenarios remain explicitly unverified until a phone or emulator is available.

## Next phase

Phase 4C will separately implement PowerSync-backed signed-in repositories and the general mutation uploader. That phase must not begin until Phase 4B has its own implementation review and approval to proceed.
