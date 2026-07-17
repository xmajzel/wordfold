# Supabase and PowerSync specification

## Status

Approved architecture documentation. The Phase 1 Supabase database foundation is implemented locally; PowerSync and application integration have not started.

This document is the canonical design for adding optional accounts, offline synchronization, and multi-device restore to Wordfold. The operational setup and future hosting migration are documented separately:

- [Initial managed setup](SUPABASE_POWERSYNC_INITIAL_SETUP.md)
- [Managed-to-self-hosted migration](SUPABASE_POWERSYNC_SELF_HOSTED_MIGRATION.md)

## Problem

Wordfold currently stores mutable application data only on the device. That gives the app strong offline behavior, but a user cannot recover their vocabulary after losing a device or continue from the same state on another device.

The target system must:

- remain fully useful without a network connection;
- synchronize after connectivity returns without blocking normal app use;
- optionally associate data with a Supabase account;
- restore the same user data on another device;
- begin on managed Supabase and PowerSync services;
- preserve a practical path to self-hosting both services;
- retain the bundled offline dictionary independently from user synchronization.

## Current repository state

The native application currently has two SQLite responsibilities:

| Database | Current responsibility | Target responsibility |
| --- | --- | --- |
| `wordfold.sqlite` | Mutable words, collections, learning events, settings, reminder schedule, and app metadata | Guest data, device-only settings, reminder schedule, and one-time import bookkeeping |
| `wordnet.sqlite` | Bundled read-only dictionary catalog | Unchanged bundled read-only dictionary catalog |
| PowerSync-managed SQLite | Not present | Signed-in user's synchronized collections, words, and learning events |

The web provider in `src/providers/app-data-provider.web.tsx` is an in-memory preview implementation. Web synchronization is not part of the first native synchronization phase.

## Architecture decision

The initial hosted architecture is:

```text
Expo app
  |-- wordnet.sqlite             bundled read-only catalog
  |-- wordfold.sqlite            guest and device-only state
  `-- PowerSync SQLite           signed-in synchronized state
          | queued writes
          v
     Supabase Data API / RPC     authenticated write path and validation
          |
          v
     Supabase Postgres           authoritative user data
          |
          | logical replication
          v
     PowerSync Cloud             authenticated download/sync path
```

PowerSync is not the authoritative write backend. Local writes enter its upload queue, and the application connector applies them to Supabase through authenticated Data API calls or Postgres functions. PowerSync then replicates the accepted Postgres state back to clients. See [PowerSync's React Native and Expo architecture](https://docs.powersync.com/client-sdks/reference/react-native-and-expo).

### Initial hosting

- Supabase Platform hosts Postgres, Auth, and optional Storage.
- PowerSync Cloud hosts the PowerSync service.
- Service configuration, database migrations, and sync configuration remain in the repository when implementation begins.
- Public app configuration uses replaceable endpoints or domains controlled by the project; clients must not depend permanently on a vendor-specific PowerSync hostname.

### Future hosting

- PowerSync Open Edition may replace PowerSync Cloud first.
- Self-hosted Supabase may replace Supabase Platform later.
- The two migrations are performed independently and validated between stages.

## Account and offline behavior

### Signed out

- The app opens and works offline without requiring an account.
- New guest words and learning activity remain in `wordfold.sqlite`.
- Synchronization and multi-device recovery are unavailable.
- Network availability does not affect normal vocabulary practice.

### First sign-in

- The app asks whether the user wants to merge existing guest data into the account.
- Import IDs are generated once and persisted locally before upload so retrying the import is idempotent.
- Collections are imported before words; words are imported before learning events.
- Existing relationships are remapped to the generated UUIDs.
- A completed import marker prevents duplicate imports.
- Guest data is retained until the server has accepted it and PowerSync has downloaded the corresponding authoritative rows.

### Signed in

- Reads and writes use the local PowerSync database.
- The app remains usable while Supabase or PowerSync is unreachable.
- Accepted local mutations upload automatically when connectivity returns.
- A second device signs in, downloads the user's bucket, and reconstructs the same vocabulary and learning history.

### Sign-out and account change

- The PowerSync connection is disconnected and its synchronized database is cleared before another account can use the device.
- Supabase session state is cleared.
- Guest/device-only SQLite data is not uploaded implicitly to a different account.
- Cached rows from the previous account must never remain visible.

## Data ownership

| Data | Authority | Synchronized | Notes |
| --- | --- | --- | --- |
| Collections | Supabase after sign-in | Yes | User-owned rows |
| User words | Supabase after sign-in | Yes | Includes learning state derived by accepted mutations |
| Learning events | Supabase after sign-in | Yes | Append-only and used for statistics/auditability |
| Dashboard statistics | Derived locally | No separate table | Calculated from synchronized words and events |
| Reminder settings | Device SQLite | No | Different devices may require different schedules |
| Scheduled notification IDs | Device SQLite | No | Native notification identifiers are device-specific |
| Preferred CEFR levels and topics | Device SQLite | No | Current recommendation/onboarding preference |
| Learning filter | Device SQLite | No | UI preference only |
| Onboarding state | Device SQLite | No | Device/application presentation state |
| Enabled/downloaded content packs | Device SQLite | No | Represents device storage and availability |
| Words added from a content pack | Supabase after sign-in | Yes | Behave like ordinary user words after addition |
| WordNet catalog | Bundled SQLite | No | Read-only licensed application content |
| Future downloadable libraries | Object storage plus device cache | Metadata only if needed | Large content is not synchronized as per-user rows |

## Target synchronized data model

All synchronized primary keys are UUIDs created on the client. PostgreSQL `uuid` values map to PowerSync SQLite `text` values. PowerSync requires a single `id` primary key for synchronized client rows; see [PowerSync client IDs](https://docs.powersync.com/sync/advanced/client-id) and [type mapping](https://docs.powersync.com/sync/types).

### `collections`

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `name text not null`
- `color text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `deleted_at timestamptz null`

### `words`

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `collection_id uuid not null`
- Current word content fields from `src/data/database.ts`
- Current learning state, streak, lapse, view, and review fields
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `deleted_at timestamptz null`

An active normalized term is unique per user, rather than globally unique. The target constraint is a partial unique index on `(user_id, normalized_term)` where `deleted_at is null`.

### `learning_events`

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `word_id uuid null`
- `type text not null`
- `value text null`
- `occurred_at timestamptz not null`

This changes the existing autoincrement event ID to a client-generated UUID. It permits offline event creation on multiple devices without ID collisions.

### Device-local import bookkeeping

Implementation will add local-only bookkeeping equivalent to:

- import status per Supabase user;
- legacy-to-UUID mappings for collections, words, and learning events;
- last import error and retry state.

The exact local table names are an implementation detail, but persisted mappings are required for safe retries.

## Authorization and sync scope

Supabase Row Level Security is the authoritative authorization layer for uploads and direct API operations. Every synchronized table is restricted to `auth.uid() = user_id` for reads and writes.

PowerSync Sync Streams mirror that ownership boundary for downloads using `auth.user_id()`. Sync configuration does not replace RLS: sync configuration controls downloaded data, while RLS controls operations reaching Postgres. See [PowerSync's Supabase RLS guidance](https://docs.powersync.com/integrations/supabase/rls-and-sync-streams).

The mobile application contains only:

- the public Supabase URL;
- the Supabase publishable key;
- a replaceable PowerSync endpoint or bootstrap configuration URL;
- the signed-in user's short-lived session.

The Supabase secret/service-role key and database replication credentials are never shipped in the application.

## Write and conflict semantics

PowerSync provides durable local operations and synchronization; it does not automatically make Wordfold's rows CRDTs. Its default update behavior is effectively last write wins unless the application backend implements another policy. Upload operations may be delivered more than once and must be idempotent. See [PowerSync conflict handling](https://docs.powersync.com/handling-writes/handling-update-conflicts).

Wordfold adopts these rules initially:

- Client-generated UUIDs make creates naturally idempotent through upsert.
- Word and collection patches use last accepted write wins.
- Postgres assigns the authoritative `updated_at` when accepting a mutation.
- Learning events are append-only and deduplicated by UUID.
- Word and collection deletion uses `deleted_at` tombstones.
- A patch to a tombstoned row does not clear `deleted_at`.
- Restoring a deleted entity requires an explicit restore operation.
- Rating a word and appending its rating event use one Postgres function/transaction.
- Permanent validation failures are surfaced to the app; the connector must not silently discard unexpected upload errors.

True CRDT fields, shared collaborative collections, and automatic semantic merging are deferred until a concrete collaboration requirement exists.

## Current-local-data transition

The first implementation must preserve existing users' data:

1. Existing native migrations continue opening `wordfold.sqlite`.
2. Signed-out behavior continues using the current repositories.
3. On first account merge, stable UUID mappings are persisted locally.
4. Rows are uploaded in dependency order through idempotent server operations.
5. PowerSync downloads the server-authoritative rows.
6. Counts and representative records are compared.
7. Only after verification is the import marked complete.
8. Legacy guest rows are retained for a defined recovery period or until the user explicitly clears them.

Importing is never triggered merely by detecting an authenticated session; the user must approve merging guest data into that account.

## Failure and edge cases

- The app starts for the first time with no connectivity.
- A user creates and rates words offline for several days.
- The app terminates while an upload batch is in progress.
- The same upload operation reaches Supabase more than once.
- Two devices edit the same word before either reconnects.
- One device deletes a word while another edits it offline.
- A normalized-term conflict occurs during guest import.
- Authentication expires while local writes are queued.
- PowerSync is reachable while Supabase writes are unavailable, or vice versa.
- A user signs out while writes are queued.
- A different user signs into the same physical device.
- The bundled WordNet database is upgraded independently of user data.

For duplicate normalized terms during guest import, implementation must show a reviewable conflict instead of silently overwriting either word.

## Observability and recovery requirements

- Monitor PowerSync replication and client upload errors.
- Record structured, privacy-safe mutation failure diagnostics.
- Back up Supabase Postgres independently of PowerSync bucket storage.
- Treat Postgres as irreplaceable user data.
- Treat PowerSync bucket storage as rebuildable synchronization state.
- Exercise restore procedures before depending on synchronization for user recovery.
- Keep schema migrations and PowerSync configuration versioned together with compatible app releases.

## Non-goals

- Synchronizing the bundled WordNet catalog.
- Replacing the native translation module.
- Synchronizing native notification identifiers.
- Implementing shared or collaborative word collections.
- Building general-purpose CRDT infrastructure.
- Adding web synchronization in the first phase.
- Self-hosting either service during initial implementation.
- Provisioning production infrastructure through this documentation change.

## Acceptance criteria for a future implementation

- A new user can use the app offline before creating an account.
- Existing local data can be merged into an account exactly once with retry safety.
- A signed-in user can create, edit, rate, and delete words while offline.
- Reconnection uploads accepted mutations and eventually empties the upload queue.
- A second device reconstructs collections, words, and learning history after sign-in.
- RLS prevents one account from reading or modifying another account's rows.
- Signing out removes synchronized data from the device before another account is shown.
- Device reminder behavior and the bundled catalog continue to work without synchronization.
- Conflict, duplicate-delivery, expired-session, and interrupted-import tests pass.
- The managed deployment can later follow the self-hosting runbook without changing the user-data model.
