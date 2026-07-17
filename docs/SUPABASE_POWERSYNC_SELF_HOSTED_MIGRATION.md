# Supabase and PowerSync managed-to-self-hosted migration

## Status and purpose

This is a future operational runbook. Do not execute it until the managed integration described in [Supabase and PowerSync specification](SUPABASE_POWERSYNC_SPECIFICATION.md) is implemented, stable, backed up, and covered by synchronization tests.

The migration is deliberately split into two independent changes:

1. PowerSync Cloud to self-hosted PowerSync while Supabase remains managed.
2. Supabase Platform to self-hosted Supabase after the PowerSync migration is stable.

Changing both services in one cutover makes authentication, replication, queued-write, and rollback failures unnecessarily difficult to isolate.

## Principles

- Preserve complete offline use throughout the migration.
- Treat Supabase Postgres as authoritative and irreplaceable.
- Treat PowerSync bucket storage as rebuildable synchronization state.
- Keep the old environment intact and read-only during the agreed recovery window.
- Test every restore and cutover on a staging clone before production.
- Freeze writes for the final small-database cutover rather than accepting divergent databases.
- Never regard a DNS switch as a complete rollback after the new database has accepted writes.

## Prerequisites

- Versioned Supabase SQL migrations.
- Versioned PowerSync service and sync configuration.
- A tested Postgres logical backup and restore procedure.
- A tested Storage object copy procedure if Supabase Storage is used.
- Project-controlled API, configuration, and synchronization hostnames.
- Automated monitoring for Postgres, disk space, PowerSync health, replication lag, TLS expiry, and backups.
- Encrypted off-site backups and at least one successful restore exercise.
- An inventory of OAuth providers, redirect URLs, SMTP settings, Edge Functions, secrets, extensions, webhooks, Realtime settings, and Storage buckets.
- A user communication and maintenance-window plan.

## Target self-hosted topology

At minimum, keep the following responsibilities logically separate even if an early deployment places them on one physical server:

```text
api.example.com
  `-- Supabase gateway
        |-- Auth
        |-- PostgREST / RPC
        |-- Storage
        `-- application Postgres

sync.example.com
  `-- PowerSync API/service
        |-- reads application Postgres logical replication
        `-- writes PowerSync bucket-storage Postgres

config.example.com
  `-- mobile bootstrap configuration
```

Do not store PowerSync bucket state in the application database. Use a separate database and credentials, even when both Postgres databases initially share a server.

Production self-hosting additionally requires TLS termination, firewalling, secret management, monitoring, update procedures, backups, and capacity planning. Review [Supabase Docker requirements](https://supabase.com/docs/guides/self-hosting/docker) and [PowerSync deployment architecture](https://docs.powersync.com/maintenance-ops/self-hosting/deployment-architecture) before choosing infrastructure.

## Phase 0: rehearsal and evidence

1. Restore a recent production database export into an isolated staging Supabase stack.
2. Copy a representative Storage bucket.
3. Start a staging self-hosted PowerSync instance against the restored database.
4. Run the complete offline and multi-device verification matrix.
5. Record timings for database export, restore, Storage copy, PowerSync initial replication, and client resynchronization.
6. Set the production maintenance window from measured timings plus recovery margin.
7. Verify rollback before touching production.

Do not proceed if user counts, checksums, RLS tests, or representative record comparisons differ.

## Phase 1: PowerSync Cloud to self-hosted PowerSync

PowerSync documents instance migration as an endpoint change when source database, authentication, and sync configuration remain equivalent. Clients keep their existing readable data while downloading a fresh synchronized state and switch atomically when ready. See [migrating between PowerSync instances](https://docs.powersync.com/self-hosting/lifecycle-maintenance/migrating).

### 1. Provision the service

1. Deploy PowerSync Open Edition or Enterprise Self-Hosted Edition from the pinned official container image.
2. Provision separate Postgres bucket storage.
3. Configure TLS at `sync-next.example.com`.
4. Configure health checks, logs, metrics, and restart policy.
5. Store service secrets outside the repository.

For local rehearsal, the PowerSync CLI workflow begins with:

```bash
npm install --global powersync
powersync init self-hosted
powersync docker configure --database postgres --storage postgres
```

The CLI Docker stack is a starting point, not proof of a production-ready deployment. Follow the current [PowerSync self-hosting setup](https://docs.powersync.com/intro/setup-guide) for the pinned version.

### 2. Connect the existing managed Supabase source

- Use the existing dedicated replication role.
- Require verified TLS.
- Keep the same `powersync` publication.
- Configure Supabase JWKS and audience `authenticated`.
- Deploy the same validated Sync Streams configuration.
- Confirm initial replication completes without lag or publication errors.

### 3. Validate before exposing users

- Connect the PowerSync diagnostics client to the new instance.
- Authenticate as two test users and verify bucket isolation.
- Compare row counts with the Cloud instance for representative accounts.
- Exercise a write through the normal Supabase upload path.
- Confirm the self-hosted instance replicates the accepted write.
- Test service restart and bucket-storage persistence.

### 4. Switch clients

1. Return `sync-next.example.com` from the bootstrap/credential response for an internal cohort.
2. Observe automatic resynchronization and upload queue behavior.
3. Expand to all clients after the cohort is stable.
4. Move the canonical `sync.example.com` hostname only after validation.
5. Keep PowerSync Cloud available during the agreed rollback window.

No Supabase data migration occurs in this phase. The client upload path remains unchanged.

### 5. Phase-one rollback

Before retiring PowerSync Cloud, rollback is an endpoint/configuration switch back to Cloud because both instances read the same authoritative Supabase database. Verify clients can resynchronize back. Do not delete either instance's bucket storage until the recovery window expires.

## Phase 2: Supabase Platform to self-hosted Supabase

Supabase provides an official platform-to-self-hosted database restore procedure. It transfers database data, including Auth tables, but does not transfer Storage objects or redeploy Edge Functions. See [restore a platform project to self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

### 1. Provision and align the target

1. Pin the self-hosted Supabase release and Postgres major version.
2. Compare source and target Auth and Storage service versions.
3. Enable every required Postgres extension before restore.
4. Configure secure production secrets, SMTP, TLS, and external URLs.
5. Recreate OAuth providers and register the new callback URLs.
6. Prepare Edge Functions and their secrets for separate deployment.
7. Configure Storage's S3-compatible endpoint and destination buckets.
8. Configure automated database and Storage backups.

Run the restore first on a disposable instance. Managed Supabase may have newer Postgres/Auth schema elements than the pinned self-hosted release, so version mismatches must be resolved before the production window.

### 2. Export the database

Use the Supabase CLI rather than an unfiltered raw `pg_dump`. Export roles, schema, and data separately:

```bash
supabase db dump --db-url "SOURCE_CONNECTION_STRING" -f roles.sql --role-only
supabase db dump --db-url "SOURCE_CONNECTION_STRING" -f schema.sql
supabase db dump --db-url "SOURCE_CONNECTION_STRING" -f data.sql --use-copy --data-only
```

Store exports encrypted, checksum them, and restrict access. Custom login-role passwords are not included and must be set separately.

### 3. Restore and validate a staging copy

1. Restore roles, schema, and data in the order required by the current Supabase guide.
2. Resolve extension, ownership, Postgres-version, Auth-schema, and Storage-schema mismatches.
3. Compare table counts, Auth user counts, indexes, constraints, RLS policies, functions, triggers, publications, and representative data.
4. Test password login with a copied Auth user.
5. Verify whether sessions must be reissued based on the JWT signing-key strategy.
6. Test OAuth and email flows against the staging hostname.

Auth user rows and password hashes are included in the database migration. Existing sessions remain valid only when the relevant signing keys remain valid; otherwise users must sign in again. Prefer an explicit reauthentication plan over copying sensitive signing material without a reviewed key-management procedure.

### 4. Copy Storage objects

Database backups contain Storage metadata, not the actual object bytes. Copy objects through the S3 protocol so the destination Storage service uses the correct internal layout. Directly placing downloaded files in a Docker volume is not supported.

The supported approach uses `rclone` with the managed and self-hosted S3 endpoints:

```bash
rclone copy platform:bucket-name self-hosted:bucket-name --progress
rclone size platform:bucket-name
rclone size self-hosted:bucket-name
```

Create matching destination buckets first and compare object counts and total bytes. Follow [Supabase's platform Storage copy guide](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3).

For large buckets, perform an initial copy before the maintenance window and a final reconciliation while writes are frozen.

### 5. Prepare parallel PowerSync validation

Before production cutover:

1. Start a parallel PowerSync service configuration at `sync-next.example.com` pointing to the restored self-hosted Supabase database.
2. Create the required `powersync` publication and replication role on the target database.
3. Use the same Sync Streams and Auth ownership semantics.
4. Allow it to complete initial replication.
5. Validate reads and writes with staging accounts.

Using a parallel instance avoids changing the source database underneath the active production sync endpoint before the new source is proven.

## Production cutover

### Before the maintenance window

- Confirm fresh off-site backups and checksums.
- Confirm target disk capacity and monitoring.
- Confirm the previous rehearsal completed within the window.
- Lower DNS TTLs far enough in advance if DNS changes are involved.
- Ensure the mobile configuration endpoint can select both old and new endpoints.
- Identify app versions that still hardcode vendor endpoints.
- Notify users that synchronization will pause; offline reading and local changes remain available.

### During the maintenance window

1. Put the managed write API into maintenance/read-only mode.
2. Stop accepting new mutations at the old upload endpoint.
3. Allow currently online client upload queues a short drain period.
4. Take the final database exports.
5. Restore the final database into the clean production target.
6. Run the final Storage reconciliation.
7. Deploy Edge Functions and configuration.
8. Recreate and verify the target PowerSync publication and replication role.
9. Start the production self-hosted PowerSync instance against the final database.
10. Wait for initial replication to complete.
11. Run database, Auth, Storage, RLS, write, replication, and account-isolation smoke tests.
12. Switch the project-controlled Supabase API and PowerSync/configuration endpoints.
13. Reauthenticate test devices if signing keys changed.
14. Remove maintenance mode only after end-to-end writes return through PowerSync on a second device.

For Wordfold's expected early data volume, a write freeze and final logical restore is safer than building a temporary bidirectional replication system. Re-evaluate this decision if measured restore time becomes incompatible with the maintenance objective.

## Offline queued writes during cutover

Offline devices may reconnect days after migration. The design must prevent them from writing into an abandoned managed database.

- Resolve API and PowerSync endpoints through project-controlled configuration.
- Cache the last validated configuration locally so endpoint discovery never blocks offline startup.
- Keep the old managed API read-only after cutover.
- Return a clear migration/upgrade error from obsolete upload endpoints.
- Refresh configuration before attempting queued uploads.
- Preserve local queues until the new endpoint accepts the operations.
- Do not acknowledge a PowerSync transaction merely because the old endpoint rejected it.
- Require an app update when an old client cannot understand the new endpoint or schema.
- Keep additive schemas compatible across the migration window where possible.

If an installed version hardcodes `*.supabase.co`, it cannot be redirected by changing the PowerSync endpoint alone. Identify and upgrade those versions before retiring the managed project.

## Validation after cutover

### Data

- Auth user count matches.
- Active and tombstoned collection/word counts match.
- Learning event counts and date ranges match.
- Constraints, indexes, RLS policies, triggers, and functions match.
- Storage object count and total bytes match.
- Representative users can access only their own rows.

### Application

- Existing password login works or the planned reauthentication flow works.
- OAuth callback and email-link flows use the new domain.
- A previously offline device uploads queued writes once.
- A second device receives those changes.
- A fresh install restores the account.
- Sign-out clears synchronized data.
- Guest mode, reminders, WordNet lookup, and native translation remain functional.

### Operations

- Database backups complete and can be restored.
- PowerSync bucket storage persists across service restart.
- Replication lag and upload failures are visible.
- TLS, SMTP, disk, CPU, memory, and connection metrics are healthy.
- No application or infrastructure logs expose tokens or database credentials.

## Rollback policy

### Before opening writes on self-hosted Supabase

Rollback is safe:

1. Keep managed Supabase authoritative.
2. Return clients to the old API and PowerSync endpoints.
3. Investigate and rebuild the target.

### After self-hosted Supabase accepts writes

A simple DNS rollback is unsafe because the databases have diverged. Choose one of these explicitly before cutover:

- forward-fix the self-hosted deployment; or
- freeze writes again, export the new changes, reconcile them into managed Supabase, validate, and only then switch back.

Never send some clients to each writable database simultaneously. Keep the old managed project read-only throughout the recovery window.

## Decommissioning

Decommission managed services only after:

- the recovery window has elapsed;
- all supported app versions use replaceable endpoints;
- backup restoration has succeeded from the self-hosted environment;
- no unexplained replication or upload errors remain;
- Storage and database comparisons are signed off;
- billing exports and required audit records are retained;
- managed project deletion has separate explicit approval.

Deleting a managed project is irreversible and is not an automatic step in this runbook.

## Ongoing self-hosting responsibilities

- Pin and regularly update Supabase and PowerSync container versions.
- Read breaking-change notes before every upgrade.
- Rehearse Postgres major-version upgrades separately.
- Run automated encrypted off-site backups and restore tests.
- Monitor replication slots and retained WAL growth.
- Run PowerSync storage migrations required by upgrades.
- Rotate secrets and signing keys through a planned session strategy.
- Maintain SMTP deliverability, OAuth registrations, DNS, and TLS.
- Capacity-plan application Postgres separately from PowerSync bucket storage.
- Document incident response and data-recovery ownership.

Self-hosting removes managed service operation, not operational responsibility.
