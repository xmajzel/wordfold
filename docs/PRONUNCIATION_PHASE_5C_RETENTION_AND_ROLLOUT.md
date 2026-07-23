# Pronunciation Phase 5C retention and rollout

Status: **retention implemented locally, not deployed or scheduled** (July 23, 2026).

This phase closes the private-audio retention gap without enabling the private preview. Remote
deployment, Cron configuration, real Azure synthesis, and physical-device validation remain
separate approval gates.

## Retention behavior

- Private asset metadata keeps the existing rolling 30-day `expires_at` value.
- A service-only cleanup function claims at most 100 expired assets for ten minutes.
- Cleanup claims use `FOR UPDATE SKIP LOCKED`, so overlapping invocations do not process the same
  active lease.
- A private pronunciation request that encounters an active cleanup claim receives the existing
  pending response. It cannot receive a signed URL for an object being deleted.
- Each claimed object is validated against its owner, synthesis version, and request hash before
  deletion.
- Storage objects are removed individually through the Supabase Storage API, with at most eight
  removals in flight.
- Metadata is finalized only for objects whose Storage removal succeeded and whose cleanup token
  still matches.
- Failed removals release their cleanup claims for retry. If the function crashes after Storage
  removal, its lease expires and the next run can retry the idempotent removal and metadata
  finalization.
- Each run also removes up to 1,000 pronunciation request audits older than 30 days.

The cleanup response contains only `claimed`, `deleted`, `failed`, `auditRowsPruned`, and
`hasMore` counts. It never returns raw text, account IDs, request hashes, Storage paths, or signed
URLs.

Supabase requires Storage objects to be deleted through the Storage API rather than directly from
the `storage` schema. Direct SQL deletion can orphan the underlying file:
<https://supabase.com/docs/guides/storage/management/delete-objects>.

## Service boundary

`pronunciation-private-cleanup` accepts `POST` only and uses the Supabase Edge Function
service-secret authentication mode. Platform JWT verification is disabled for this function
because the service secret is sent in the `apikey` header and is then verified by
`withSupabase({ auth: 'secret' })`. The four cleanup database functions revoke execution from
`public`, `anon`, `authenticated`, and `powersync_role`; only `service_role` can execute them.

Private cleanup metadata is not published to PowerSync. No Azure provider credential is read by
the cleanup function, and cleanup never invokes synthesis.

## Planned remote schedule

After a separate deployment approval:

1. Push the additive cleanup migration to the linked development Supabase project.
2. Deploy the updated `pronunciation-private` and new `pronunciation-private-cleanup` functions.
3. In Supabase Cron, create `pronunciation-private-cleanup-hourly` with schedule
   `17 * * * *`.
4. Configure the job to invoke the cleanup function with the Supabase service secret. The secret
   must be stored in the managed remote configuration and must not be committed in SQL, source,
   documentation, or Expo configuration.
5. Invoke one empty or synthetic cleanup run and inspect only the returned counts, Edge Function
   status, and Cron history.
6. Keep `EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED=false`.

Supabase Cron is based on `pg_cron`, can invoke Edge Functions, and recommends no more than eight
concurrent jobs with each job completing within ten minutes:
<https://supabase.com/docs/guides/cron>.

## Monitoring and recovery

- Any nonzero `failed` count returns HTTP `503`, making the run visible as unsuccessful while
  preserving successful per-object finalizations.
- `hasMore=true` means the 100-asset cap was reached. Repeated results require an additional
  operator-triggered run or a temporary, explicitly approved schedule adjustment.
- A top-level repository or Storage failure returns only `cleanup_unavailable`.
- Stale cleanup leases are reclaimable after ten minutes.
- An account opting out continues to use the existing immediate owner-scoped deletion path rather
  than waiting for scheduled expiry.

The local migration is additive. If a remote rollout must be stopped, first disable the Cron job
and redeploy the previous private function. The unused columns and service-only functions may
remain dormant until a reviewed forward migration removes them; this project does not use
destructive down migrations.

## Local verification

- The migration applies from a clean local database reset.
- Private database tests cover service-only permissions, expired/non-expired selection, the
  request/cleanup race, mismatched cleanup tokens, release/retry, matching finalization, and
  30-day audit pruning.
- Cleanup core tests cover method restrictions, successful deletion ordering, partial Storage
  failure, unsafe object paths, empty runs, bounded output, and incomplete finalization.
- The existing public-pronunciation and PowerSync database regression suites remain unchanged and
  pass.
- All 64 Jest suites (287 tests), TypeScript, Expo lint, schema lint, offline-manifest
  verification, and Android/iOS/web local Expo export pass.
- Expo Doctor reports 18/21. The existing duplicate React and React Native Directory findings
  remain, and the current checker also recommends newer SDK 56 patch versions for thirteen
  dependencies. Phase 5C changes no application dependency.
- No remote migration, Edge Function deployment, Cron job, real Azure request, EAS build, or
  physical-device request was performed.

## Remaining release gates

- Explicit approval immediately before the remote Supabase deployment and Cron configuration.
- Update the privacy policy and confirm the applicable Microsoft DPA before any private text is
  sent to Azure.
- Validate remote two-account isolation using synthetic assets before the first real private
  synthesis request.
- Confirm production budget alerts and monitoring ownership.
- Enable the client flag only for an approved Android development pilot.
- Complete iOS validation when a physical iOS device becomes available.
