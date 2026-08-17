# Phase 4C: synchronized repositories and continuous uploads

## Status

Approved and implemented on 2026-07-20. The version 6 device migration, resumable delta cutover, PowerSync vocabulary repository, Supabase uploader, provider authority switch, safe upload/rejection status, and sign-out cleanup are implemented with focused tests.

Release verification completed on 2026-08-17. Automated checks, authenticated native cutover, offline mutation and reconnection, rejected-write rollback, force-close recovery, sign-out with pending writes, and second-device restoration all pass. Phase 4C added no Supabase schema or Sync Streams change; the development replication credential was rotated and its PowerSync service connection revalidated separately.

Phase 4A provides the authenticated PowerSync connection. Phase 4B provides a user-confirmed, resumable guest snapshot import. Phase 4C completes the native cutover so signed-in vocabulary reads and writes use PowerSync locally and upload to Supabase when connectivity returns.

## Problem

The app still treats `wordfold.sqlite` as the live vocabulary database after sign-in. Phase 4B can place a confirmed snapshot in Supabase and verify that PowerSync downloaded it, but later edits remain device-only, a second device cannot become the active vocabulary source, and the connector deliberately rejects queued PowerSync writes.

The cutover cannot simply change database handles. It must first reconcile local changes made after the Phase 4B snapshot, preserve device-only reminder/preferences data, make compound learning mutations idempotent, and prevent a failed upload or sign-out from exposing another account's rows.

## Decisions

### Minimal approach and alternatives

The recommended implementation keeps the current provider contract and adds one narrow vocabulary-store boundary. This avoids rewriting screens and keeps all device-only repository calls unchanged.

- A direct database-handle switch is smaller but unsafe because post-import guest changes and reminder foreign keys would be lost or broken.
- Permanent dual-writing to both SQLite databases appears convenient but creates two authorities, makes rollback ambiguous, and is not adopted.
- Moving every device preference into PowerSync would simplify the provider superficially but changes approved data ownership and is not adopted.
- A custom generic server mutation endpoint could make every upload transaction server-atomic, but the existing Supabase tables and focused rating/view RPCs already cover the current behavior with less infrastructure.

### Scope split inside Phase 4C

Implementation proceeds in this order:

1. reconcile the post-import guest delta and establish a durable cutover-ready marker;
2. implement and test the PowerSync vocabulary repository;
3. enable the Supabase upload connector;
4. switch the provider to PowerSync only after cutover readiness;
5. expose upload/offline status and verify the complete native flow.

The app must remain on the guest repository if a prerequisite fails. It must never present a partially reconciled account as the active synchronized vocabulary.

### Data authority

- Signed out: collections, words, and learning events use `wordfold.sqlite` exactly as today.
- Signed in with unconfirmed guest data: vocabulary remains in `wordfold.sqlite`; the import action remains available.
- Signed in after a completed Phase 4B import and successful delta reconciliation: synchronized vocabulary uses `wordfold-sync.sqlite`.
- Signed in on a device with no importable guest vocabulary: synchronized vocabulary activates after the first complete PowerSync download; no empty import confirmation is required.
- Once synchronized mode is active for the current session/account, a network outage does not fall back to guest rows. Previously downloaded PowerSync rows and queued writes remain active offline.
- Reminder settings, scheduled notification bookkeeping, learning preferences, filters, onboarding state, content-pack state, and the bundled catalog remain in `wordfold.sqlite` in every mode.
- Retained guest vocabulary is not kept in lockstep after cutover. Signing out intentionally returns to that account-independent guest dataset.

## Expected behavior

### Cutover reconciliation

- A local `sync_cutovers` record is scoped by Supabase user ID and stores `checking`, `needs_conflicts`, `uploading`, `verifying`, `ready`, or `error`, plus progress, safe error details, and timestamps.
- Reconciliation uses the stable Phase 4B mappings and their `source_updated_at` values.
- Collections or words created after the confirmed snapshot receive a stable account-scoped UUID mapping before any remote write.
- Learning events created after the snapshot receive stable UUID mappings and remain append-only.
- A mapped collection or word whose local `updated_at` differs from its imported source timestamp is uploaded as a changed row.
- A mapped word that no longer exists locally is tombstoned through the existing authenticated `tombstone_word` function.
- Phase 4B words resolved as **Keep account version**, and their local learning events, remain excluded unless the user explicitly resolves a newly detected cutover conflict.
- New local words that collide with an active account `normalized_term` use the existing **Keep account version** / **Use this device version** choices.
- If an already-imported local word was renamed to collide with a different account word, cutover stops. The screen offers **Keep account versions** (discard that local rename from the account) or lets the user return to the guest library and rename it; it never tombstones another account word implicitly.
- Reconciliation writes through authenticated Supabase operations in dependency order and verifies expected IDs through PowerSync before recording `ready`.
- Reconciliation is idempotent and resumes from durable mappings/checkpoints after termination or connectivity loss.
- Immediately before activating synchronized mode, reconciliation checks the local snapshot again. A new difference invalidates readiness and is processed before cutover.

### Synchronized repository

- Active collections and words are read from PowerSync with `deleted_at IS NULL`.
- Dashboard statistics are derived from active PowerSync words and synchronized learning events using the existing definitions.
- Creates use `Crypto.randomUUID()` and insert complete rows into PowerSync locally without waiting for a network response.
- Edits, translation updates, resets, views, ratings, and tombstones modify PowerSync locally first and return as soon as the SQLite transaction succeeds.
- A rating is one local PowerSync transaction containing the word state patch and one UUID-keyed rating event.
- A view is one local PowerSync transaction containing the word counter patch and one UUID-keyed view event.
- Notification opens append one UUID-keyed event and may have a null word ID.
- Word deletion is a local `DELETE`, which the connector converts to the server tombstone function. Queries hide tombstones.
- Bulk recommended-word creation uses one local PowerSync write transaction.
- Remote downloads trigger a throttled provider refresh so changes from another device appear without restarting the app.
- Existing optimistic UI behavior remains; review buttons are not disabled while a network upload completes.

### Upload connector

- `uploadData()` processes exactly one complete PowerSync CRUD transaction per call and calls `transaction.complete()` only after every operation was either accepted by Supabase or explicitly classified as a known rejected mutation.
- `PUT` operations:
  - collections and words use authenticated UUID-keyed upserts;
  - learning events use insert-on-conflict-do-nothing.
- `PATCH` operations:
  - collections and words update only the supplied mutable fields for the current user;
  - learning-event patches are unexpected and block the queue for developer investigation.
- `DELETE` operations:
  - words and collections call the existing authenticated tombstone functions;
  - learning-event deletion is unexpected and blocks the queue.
- A transaction containing the recognized word patch plus rating event calls `apply_word_rating` once and does not apply those two CRUD entries separately.
- A transaction containing the recognized view-count patch plus view event calls `record_word_view` once and does not apply those two CRUD entries separately.
- Duplicate delivery is safe: UUID upserts, event conflict handling, and the existing RPC event deduplication make retries idempotent.
- Network, expired-session, unavailable-backend, unknown table/operation, schema mismatch, and unexpected server failures throw. The transaction remains queued and PowerSync retries it.
- Known user-data validation rejections are recorded in a PowerSync local-only `sync_write_errors` table with a privacy-safe message, then acknowledged so the server-authoritative row can roll back the rejected optimistic change and later writes are not blocked forever.
- Initial known rejection classes are duplicate active normalized term, an already-tombstoned target, and a missing owned target. No unexpected error is silently acknowledged.

PowerSync documents that local writes enter its upload queue atomically, `uploadData()` is retried after thrown errors, and completed rejected writes converge back to server state. The implementation follows the current [React Native SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo), [client/backend integration](https://docs.powersync.com/configuration/app-backend/client-side-integration), and [validation-error guidance](https://docs.powersync.com/handling-writes/handling-write-validation-errors).

### Status and error UX

- The sync context exposes whether it is downloading or uploading, the pending CRUD count, a safe upload error, and the latest known rejected mutation.
- Account and Settings distinguish:
  - preparing account data;
  - synchronized;
  - offline with local writes safely queued;
  - uploading pending changes;
  - a retrying upload error;
  - a rejected change that was rolled back.
- Raw Supabase messages, SQL, tokens, row contents, and database credentials are never rendered.
- A rejected duplicate word tells the user that the account already contains that word and that the account copy was kept.

### Sign-out and account switching

- Sign-out waits for guest reconciliation to pause, cancels scheduled OS notifications, clears local scheduled-notification rows, disconnects and clears PowerSync (including its local-only rejection journal), and only then clears the Supabase session.
- Sign-out does not wait for the upload queue to empty; queued account writes are discarded only after the user explicitly confirms sign-out through the existing action.
- If notification clearing or PowerSync clearing fails, Supabase sign-out does not proceed.
- A different account never sees the previous account's synchronized rows, local rejection journal, or scheduled notification payloads.

## Local data model changes

### `wordfold.sqlite` version 6

Add:

```sql
create table sync_cutovers (
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
  ready_at text
);
```

`scheduled_reminders` is rebuilt without its foreign key to guest `words`. It continues to store only the native notification ID, current active word ID, and scheduled timestamp. This is required because synchronized word UUIDs do not exist in `wordfold.sqlite`.

Existing guest vocabulary, Phase 4B mappings, reminder settings, and scheduled native notifications are otherwise preserved by migration.

### PowerSync client schema

Add a local-only table:

```text
sync_write_errors:
  user_id, operation_id, table_name, row_id, operation,
  error_code, safe_message, created_at, acknowledged_at
```

It is not included in Supabase, the publication, or Sync Streams, and is cleared during sign-out.

No Supabase/Postgres migration and no PowerSync service or Sync Streams deployment are required for Phase 4C; the required RPCs, RLS policies, grants, publication, and synchronized columns already exist.

## Application contracts

### Vocabulary store

A small internal `VocabularyStore` interface covers only synchronized/guest vocabulary behavior:

- list/get collections and words;
- create/edit/translate/reset/tombstone words;
- create collections and bulk words;
- rate/view words and record notification opens;
- derive dashboard statistics;
- subscribe to synchronized-table changes.

One adapter wraps the existing guest repository. One adapter uses `powerSyncDatabase`. Device-only settings continue calling the existing repository directly.

### Provider state

The application data context adds an internal/publicly displayable source state: `loading`, `guest`, `reconciling`, or `synced`. Screens continue consuming the existing word/collection/action contract; ordinary vocabulary screens do not select databases themselves.

The sync context adds:

- `uploading`;
- `pendingUploads`;
- `uploadErrorMessage`;
- latest safe rejected-write summary;
- refresh/acknowledge rejection actions if needed by Account UI.

No existing screen receives Supabase or SQLite handles.

## Files/modules likely to change

- `src/data/database.ts` and tests: version 6 cutover journal and reminder-table rebuild.
- `src/data/sync/schema.ts`: local-only rejected-write table.
- `src/data/sync/cutover.ts`, repository, types, and tests: delta planning, conflicts, checkpoints, verification, and readiness.
- `src/data/sync/repository.ts` and tests: PowerSync-backed vocabulary operations and row mapping.
- `src/data/vocabulary-store.ts`: minimal guest/synchronized adapter contract.
- `src/data/sync/uploader.ts` and tests: CRUD transaction classification and authenticated Supabase application.
- `src/data/sync/connector.ts` and tests: delegate `uploadData()` to the uploader.
- `src/providers/sync-provider.tsx`, `sync-types.ts`, and tests: upload queue/status/rejection state.
- `src/providers/app-data-provider.tsx` and tests: authority selection, reactive PowerSync refresh, and device-local settings split.
- `src/app/account-import.tsx`, `account.tsx`, `settings.tsx`, and focused tests: reconciliation/conflict/status messaging.
- `src/features/reminders/scheduler.ts` and tests: synchronized UUID-compatible bookkeeping and sign-out clearing.
- Supabase/PowerSync documentation status sections after implementation.

Exact filenames may be combined when the existing module stays clearer, but the behavior and boundaries above do not change without another approval.

## Edge cases

- App termination during delta mapping, direct upload, verification, or repository activation.
- Guest edits or events added after Phase 4B completion and again during reconciliation.
- Fresh device with no guest words but existing account vocabulary.
- Signed-in launch while offline after a prior successful synchronized session.
- Offline creates, edits, ratings, views, deletes, and notification opens.
- The same CRUD transaction delivered more than once.
- Session expiry during a Supabase upload.
- Supabase reachable while PowerSync is offline, and the reverse.
- Concurrent edits on two devices; last server-accepted field value wins.
- Delete on one device and later edit on another; tombstone wins.
- Concurrent creation of the same normalized term; rejected local create is reported and rolls back to the account copy.
- Rating/view RPC succeeds but the client terminates before completing its queue transaction.
- Sign-out with queued writes, scheduled notifications, or an active reconciliation.
- Switching to a different user on the same installation.
- Notification navigation to a synchronized word while offline.

## Risks and assumptions

- PowerSync is local-first synchronization, not automatic CRDT merging. Phase 4C retains the approved last-write/tombstone rules.
- Known validation rejection classification must remain narrow. Misclassifying a transient or programming error as rejected could acknowledge a change that should have retried.
- Server and device timestamps can differ; timestamps are used to identify a changed guest snapshot, not to resolve concurrent account writes.
- Removing the scheduled-reminder foreign key weakens local referential enforcement, so every schedule rebuild and sign-out must clear stale rows explicitly.
- The authenticated native and two-device recovery flows were release-verified on 2026-08-17.

## Explicitly not changed

- No web synchronization.
- No synchronization of reminders, preferences, filters, onboarding state, content packs, or catalog data.
- No deletion of retained guest vocabulary after cutover.
- No automatic import into a different account without confirmation.
- No collaborative collections or CRDT fields.
- No restore UI for tombstoned words or collections.
- No server-side dead-letter/admin dashboard.
- No self-hosting migration.
- No EAS cloud build without separate explicit approval immediately before that build.

## Minimal acceptance criteria

- A signed-out user retains all current offline behavior.
- A signed-in account never activates synchronized reads until the Phase 4B snapshot and post-snapshot delta are verified in PowerSync.
- A fresh device with no guest vocabulary activates downloaded account data after its first complete sync.
- Signed-in create, edit, translate, reset, rate, view, notification-open, bulk-add, and delete operations succeed locally without connectivity.
- Reconnection applies accepted writes to Supabase, empties the upload queue, and downloads the authoritative result.
- Rating and view retries do not duplicate events or counters.
- Tombstoned rows stay hidden and cannot be restored by a stale patch.
- Known rejected mutations are visible and roll back; transient and unexpected failures remain queued and visible.
- Remote changes refresh the active UI without restarting.
- Reminder scheduling accepts synchronized UUIDs and is cleared safely on sign-out.
- Switching accounts cannot reveal prior synchronized rows or errors.
- Existing Phase 4B import behavior and guest data remain intact.
- Database/RLS tests, focused repository/uploader/provider/UI tests, the full Jest suite, lint, TypeScript, Expo Doctor, PowerSync configuration validation, local Expo export, and local Android debug build complete with no new failures.
- Manual native testing covers offline mutation/reconnection, force-close recovery, sign-out with pending writes, rejected duplicate rollback, and restoration on a second device before release.

## Verification order

1. Unit-test delta planning, repository SQL, uploader classification/idempotency, and provider authority selection.
2. Run local Supabase database tests and lint where Docker is available.
3. Run the full Jest suite, lint, TypeScript, Expo Doctor, and `powersync validate`.
4. Run an all-platform local Expo export.
5. Run a local Android debug build.
6. On a native development build, verify initial cutover, airplane-mode mutations, reconnect/upload convergence, force-close recovery, sign-out clearing, and a second-device restore.
7. Use an EAS cloud build only after separate explicit approval because project build quota is limited.

## Implementation task graph

1. **Cutover foundation:** add the version 6 local migration, cutover journal, delta planner, conflict persistence, and verification tests.
2. **Vocabulary store:** add the shared contract and PowerSync repository with offline mutation tests. Depends on task 1.
3. **Uploader:** implement CRUD/RPC dispatch, known-rejection handling, retry behavior, and connector tests. Can proceed after the repository mutation shapes from task 2 are fixed.
4. **Provider cutover:** select guest versus synchronized authority, subscribe to PowerSync changes, and keep device-only settings local. Depends on tasks 1–3.
5. **UX and reminders:** add cutover/upload/rejection states and UUID-compatible reminder/sign-out behavior. Depends on task 4.
6. **Verification and documentation:** run all local gates, self-review against this specification, and record native verification results. Depends on tasks 1–5.

Each task is reviewable independently, but no intermediate state is considered release-ready before task 6.

## Local implementation verification

Completed on 2026-07-20:

- Jest: 34 suites and 132 tests passed.
- Expo lint: passed.
- TypeScript `tsc --noEmit`: passed.
- Expo all-platform local export: Android, iOS, and web bundles plus static routes passed.
- Local Android Gradle `assembleDebug`: passed; no EAS quota was used.
- Local Supabase schema lint: passed with no schema errors.
- Local Supabase pgTAP suite: all 53 database, RLS, replication-role, RPC idempotency, tombstone, and tenant-isolation checks passed. Because Docker Desktop did not share the workspace path, the same versioned SQL test was copied into the running local database container and executed there with `ON_ERROR_STOP` enabled.
- PowerSync Cloud diagnostics: the deployed source is connected, initial replication is complete, replication lag is zero, and `collections`, `words`, and `learning_events` have no reported errors. Full validation passes for the configuration schema, source connection, and Sync Streams.
- Expo Doctor: 19 of 21 checks passed. The remaining checks report the existing `react` copy under the PowerSync CLI's `@oclif/table` dependency and React Native Directory metadata warnings for Quick SQLite and the local `wordfold-translate` module; the successful native build provides the stronger native compatibility check for this implementation.

Environment notes:

- The standard `supabase test db` wrapper cannot mount `supabase/tests` because Docker Desktop does not currently share this workspace path; the pgTAP SQL itself passed through the container execution described above.

Manual native verification completed on 2026-08-17: authenticated cutover, airplane-mode mutation/reconnect, rejected-write rollback, force-close recovery, sign-out with pending writes, and second-device restoration all passed.
