# Supabase and PowerSync initial managed setup

## Status and scope

This is an implementation runbook for the architecture in [Supabase and PowerSync specification](SUPABASE_POWERSYNC_SPECIFICATION.md).

Implementation status:

- Phase 1 is implemented in `supabase/config.toml`, `supabase/migrations/20260717000000_create_sync_database.sql`, and `supabase/tests/database/sync_database.test.sql`.
- The migration creates the synchronized schema, RLS policies, transactional functions, tombstone protections, and the publication used by PowerSync.
- The development Supabase schema and the dedicated read-only replication role are deployed through versioned migrations.
- PowerSync CLI `0.10.0` is pinned, and `powersync/service.yaml` plus `powersync/sync-config.yaml` are the versioned Cloud configuration.
- The EU PowerSync Cloud development instance is connected with verified TLS, Supabase Auth discovery, edition 3 user-scoped Sync Streams, and healthy initial replication for all three synchronized tables.
- Phase 3 authentication is configured and device-tested, including confirmation callbacks and persisted native sessions.
- Phase 4A native PowerSync transport is implemented locally and its Android debug build passes; the public client endpoint, installation of the rebuilt development client, and authenticated connection smoke test remain pending.

The first deployment uses:

- Supabase Platform for Postgres and Auth;
- PowerSync Cloud for synchronization;
- a native PowerSync SQLite adapter for iOS and Android;
- the existing `expo-sqlite` database for guest/device-only state;
- the existing bundled `wordnet.sqlite` catalog unchanged.

The first implementation does not add PowerSync to the static web preview.

## Prerequisites

- Expo SDK 56 and the existing custom development-build workflow.
- A Supabase project in the intended production region.
- A PowerSync project with separate development and production instances.
- A project-controlled HTTPS bootstrap/configuration endpoint or a migration-safe endpoint strategy.
- The ability to run SQL migrations against Supabase.

PowerSync's native React Native adapters do not run inside Expo Go. Wordfold already requires a development build for its native translation module, so the synchronization implementation should use the same development-build workflow. Do not consume EAS cloud build quota without explicit approval; use tests, type checking, linting, Expo Doctor, local export, and local native builds first.

Official references:

- [Supabase Expo quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)
- [PowerSync Supabase integration](https://docs.powersync.com/integrations/supabase/guide)
- [PowerSync React Native and Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo)
- [Expo SDK 56 SQLite](https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/)

## Repository artifacts required during implementation

Keep these artifacts under version control rather than configuring production only through dashboards:

```text
supabase/
  migrations/
    <timestamp>_create_sync_schema.sql
powersync/
  service.yaml             # no secrets; environment references only
  sync-config.yaml
.env.example               # public placeholders only
src/
  data/sync/               # PowerSync schema, connector, and repositories
```

Exact source filenames may follow the implementation specification approved at that time. Secrets must remain outside Git.

## 1. Create the Supabase project

1. Create development and production projects separately.
2. Record the project region and Postgres major version.
3. Enable the required authentication methods.
4. Keep email confirmation enabled in production unless a separately approved product decision changes it.
5. Configure redirect URLs for the `wordfold` application scheme.
6. Use the current Supabase publishable key, not a secret/service-role key, in the app.

The eventual app environment shape is:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://api.example.com
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-with-public-key
EXPO_PUBLIC_APP_CONFIG_URL=https://config.example.com/mobile.json
```

`EXPO_PUBLIC_` values are included in the application bundle. They must never contain database passwords, replication credentials, JWT signing keys, or service-role keys.

Using a project-controlled API hostname or configuration endpoint makes a later hosting migration possible without permanently binding installed applications to `*.supabase.co` or a PowerSync Cloud hostname. Cache the last validated configuration on-device so an unavailable configuration endpoint never prevents offline startup. Refresh it only when the app has connectivity and retain a known-good fallback.

## 2. Add the synchronized Postgres schema

The committed migration at `supabase/migrations/20260717000000_create_sync_database.sql` implements the following model. This abbreviated SQL remains a design reference; the migration file is authoritative and must be tested against a staging project before cloud deployment.

```sql
create table public.collections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table public.words (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null,
  term text not null,
  normalized_term text not null,
  source_language_code text not null default 'en',
  target_language_code text not null default 'sk',
  part_of_speech text,
  definition text not null,
  example text,
  translation text,
  catalog_sense_id text,
  cefr_level text check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  source text not null default 'manual'
    check (source in ('manual', 'spoken', 'business', 'academic')),
  state text not null default 'new'
    check (state in ('new', 'cannot_remember', 'understood', 'learned')),
  understood_streak integer not null default 0,
  lapse_count integer not null default 0,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  last_rated_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (collection_id, user_id)
    references public.collections(id, user_id)
);

create unique index words_user_normalized_term_active_idx
  on public.words(user_id, normalized_term)
  where deleted_at is null;

create index words_user_state_due_idx
  on public.words(user_id, state, next_review_at)
  where deleted_at is null;

create index words_user_collection_idx
  on public.words(user_id, collection_id)
  where deleted_at is null;

create table public.learning_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid,
  type text not null check (type in ('view', 'rating', 'notification_open')),
  value text,
  occurred_at timestamptz not null,
  foreign key (word_id, user_id)
    references public.words(id, user_id)
);

create index learning_events_user_time_idx
  on public.learning_events(user_id, occurred_at desc);
```

Before implementation approval, decide whether permanently deleting an account should cascade immediately or enter a retention workflow. The schema above follows Supabase user deletion with cascading data deletion.

### Authoritative timestamps and compound operations

The migration should add narrowly scoped Postgres functions or triggers for:

- setting `updated_at` to server time on accepted changes;
- rating a word and appending the rating event atomically;
- recording a view and updating the word counter atomically;
- tombstoning a word without allowing a later ordinary patch to revive it;
- tombstoning a collection only under an explicitly approved child-word policy.

Expose only functions needed by authenticated clients and verify their ownership and `search_path`. Do not use a broad `security definer` function as a way to bypass RLS.

## 3. Enable Row Level Security

RLS is required on every synchronized table. Collections and words allow owned reads, inserts, and updates. They do not allow physical deletes; deletion is an update that sets `deleted_at`. Learning events allow owned reads and inserts only because they are append-only.

```sql
alter table public.collections enable row level security;
alter table public.words enable row level security;
alter table public.learning_events enable row level security;

create policy "read owned collections"
  on public.collections
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "insert owned collections"
  on public.collections
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update owned collections"
  on public.collections
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "read owned words"
  on public.words
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "insert owned words"
  on public.words
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update owned words"
  on public.words
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "read owned learning events"
  on public.learning_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "insert owned learning events"
  on public.learning_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke delete on public.collections from authenticated;
revoke delete on public.words from authenticated;
revoke update, delete on public.learning_events from authenticated;
```

Test RLS with two real test users. Testing only with the service-role key does not verify tenant isolation because that key bypasses normal user policies. The final migration must also grant the exact required `select`, `insert`, and `update` privileges; do not assume dashboard defaults are the intended production privilege model.

## 4. Prepare Postgres for PowerSync

Supabase has logical replication enabled. Create a dedicated read-only replication role with a generated password stored only in the service's secret manager.

```sql
create role powersync_role
  with replication bypassrls login
  password 'replace-with-generated-secret';

grant select on public.collections to powersync_role;
grant select on public.words to powersync_role;
grant select on public.learning_events to powersync_role;
```

Create a publication containing only the synchronized tables:

```sql
create publication powersync
  for table public.collections, public.words, public.learning_events;
```

If the `powersync` publication already exists, alter it instead of creating another publication with the same name. Restricting the publication avoids replicating unrelated Supabase tables. Follow the current [PowerSync Postgres source setup](https://docs.powersync.com/configuration/source-db/setup) when executing this step.

## 5. Configure PowerSync Cloud

1. Create development and production PowerSync instances.
2. Connect each to the corresponding Supabase direct Postgres endpoint with `powersync_role`.
3. Use TLS verification for all public database connections.
4. Enable Supabase Auth/JWKS validation and audience `authenticated`.
5. Keep the production endpoint behind replaceable app configuration.
6. Configure replication and connection alerts before release.

PowerSync Cloud can infer the Supabase JWKS endpoint from a standard Supabase connection. Verify this explicitly rather than assuming auto-detection succeeded. See [PowerSync Supabase Auth configuration](https://docs.powersync.com/configuration/auth/supabase-auth).

## 6. Define the sync scope

Use current Sync Streams syntax and pin its configuration edition. Select explicit fields so adding a server-only column cannot accidentally expose it to clients.

```yaml
config:
  edition: 3

streams:
  user_data:
    auto_subscribe: true
    queries:
      - |
        SELECT
          id, user_id, name, color, created_at, updated_at
        FROM collections
        WHERE user_id = auth.user_id()
          AND deleted_at IS NULL
      - |
        SELECT
          id, user_id, collection_id, term, normalized_term,
          source_language_code, target_language_code,
          part_of_speech, definition, example, translation,
          catalog_sense_id, cefr_level, source, state,
          understood_streak, lapse_count, view_count,
          last_viewed_at, last_rated_at, next_review_at,
          created_at, updated_at
        FROM words
        WHERE user_id = auth.user_id()
          AND deleted_at IS NULL
      - |
        SELECT
          id, user_id, word_id, type, value, occurred_at
        FROM learning_events
        WHERE user_id = auth.user_id()
```

Validate and deploy the configuration against development before production. Sync Streams limit downloads; they do not authorize uploads. RLS remains mandatory.

If Sync Streams syntax or edition support changes before implementation, update this example to the current documented edition and record the decision in the architecture specification.

## 7. Add native client dependencies

The initial recommendation is PowerSync's React Native SDK with React Native Quick SQLite because PowerSync describes it as the more battle-tested native adapter. OP-SQLite remains an alternative if a separate implementation decision prioritizes built-in SQLCipher support.

The implementation command should be equivalent to:

```bash
pnpm exec expo install @supabase/supabase-js react-native-url-polyfill
pnpm exec expo install @powersync/react-native @journeyapps/react-native-quick-sqlite
```

Use Expo's installer to resolve versions compatible with the installed Expo/React Native versions. Review resulting native configuration before committing. A new native development build is required after adding the adapter.

Supabase session persistence may use the existing Expo SQLite local-storage adapter:

```ts
import 'expo-sqlite/localStorage/install';
import 'react-native-url-polyfill/auto';
```

Session storage security must be reviewed before implementation. If the selected threat model requires encrypted token storage, approve and document a different storage adapter instead of silently changing dependencies.

## 8. Implement the client data boundary

Keep screens consuming the existing `AppDataProvider` contract where practical. The least-invasive design is to select a repository implementation based on account state:

- signed out: current Expo SQLite guest repositories;
- signed in: PowerSync-backed repositories;
- recommendation preferences, reminder settings, and other device-only metadata: existing Expo SQLite repositories in both modes;
- catalog lookup: existing bundled Expo SQLite catalog in both modes;
- web: current preview provider until web sync is separately approved.

The PowerSync database must have only one active instance per database file. Define client-side tables that mirror the synchronized columns and use client-generated UUIDs for every create.

## 9. Implement the PowerSync connector

The connector has two responsibilities:

### Credentials

- Read the current Supabase session.
- Return the current PowerSync endpoint and Supabase access token.
- Refresh or reauthenticate when the session expires.
- Never fabricate credentials while signed out.

### Uploads

- Read one queued CRUD transaction.
- Apply each operation to Supabase through the authenticated Data API or a narrow RPC.
- Use upsert by UUID for creates.
- Patch only changed fields and never clear `deleted_at` through an ordinary update.
- Convert deletes to tombstone operations.
- Use atomic RPCs for rating/view operations that update a word and append an event.
- Complete the PowerSync transaction only after Supabase accepts the complete corresponding operation.
- Leave transient failures queued for retry.
- Route permanent validation failures to an explicit error state rather than retrying forever or silently dropping them.

PowerSync's upload queue records `PUT`, `PATCH`, and `DELETE` operations. Backend handling must be idempotent because delivery can repeat. See [writing client changes](https://docs.powersync.com/handling-writes/writing-client-changes) and [write validation errors](https://docs.powersync.com/handling-writes/handling-write-validation-errors).

## 10. Import existing local data

The first authenticated release needs a resumable guest-import workflow:

1. Ask whether the user wants to merge local data.
2. Persist an import record keyed by the Supabase user ID.
3. Generate and persist legacy-to-UUID mappings.
4. Map the fixed `my-words` collection to a UUID.
5. Upload collections, then words, then events.
6. Resolve normalized-term conflicts through a user-visible choice.
7. Wait for the upload queue to drain.
8. Confirm that PowerSync downloaded the expected rows.
9. Compare counts and representative IDs.
10. Mark the import complete.

Do not delete the guest database during this process. Retrying must reuse the same UUID mappings so Supabase upserts do not create duplicates.

## 11. Verification matrix

### Automated checks

- Repository tests for both guest and signed-in data implementations.
- UUID and import-mapping tests.
- Connector translation tests for PUT, PATCH, DELETE, retry, and permanent failure.
- RLS integration tests with two users.
- Conflict tests for concurrent edit/edit and edit/delete.
- Rating transaction and append-only event tests.
- Sign-out clearing and account-switch isolation tests.
- Type checking and linting.

### Manual native scenarios

1. Fresh install with no network; add and rate a guest word.
2. Reconnect and create an account; merge guest data.
3. Terminate the app during upload; reopen and verify a single copy.
4. Sign into a second device and verify restored data.
5. Edit the same word offline on both devices and verify documented last-write behavior.
6. Delete a word on one device and edit it offline on another; verify it remains deleted.
7. Expire the session with queued writes; reauthenticate and verify upload resumes.
8. Sign out and sign in as another user; verify no rows leak between accounts.
9. Verify reminders and WordNet lookup while both backend services are unavailable.

Use PowerSync's diagnostics client to inspect bucket contents and synchronized SQLite state before production release.

## 12. Release and operations checklist

- Database migrations are repeatable in an empty development project.
- Rollback behavior is documented for every schema migration.
- RLS and Sync Streams select the same ownership boundary.
- No secrets are present in the application bundle or repository.
- Development and production use separate credentials and instances.
- Postgres backup and restore have been exercised.
- Replication lag and upload failures have alerts.
- The PowerSync endpoint can be changed without hardcoding a new vendor URL in every data operation.
- Old app versions remain compatible or are explicitly blocked before a breaking schema change.
- EAS cloud builds are run only after explicit approval because project build quota is limited.
