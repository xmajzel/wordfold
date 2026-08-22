# Pronunciation Phase 5C retention and rollout

Status: **deployed and verified in development and production; privacy disclosure complete;
client preview remains disabled** (August 22, 2026).

This phase closes the private-audio retention gap without enabling the private preview. The
development and production Supabase cleanup rollouts, synthetic retention validations, and the
controlled production Azure canary are complete. Physical-device private-preview validation
remains a separate approval gate.

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

## Development rollout (Phase 5D)

The approved development-only rollout was completed on August 17, 2026:

1. The paused development Supabase project was restored. The separate production Supabase and
   PowerSync environments were not accessed or changed.
2. The two pending additive migrations,
   `20260722210000_create_private_pronunciation_preview.sql` and
   `20260723120000_add_private_pronunciation_cleanup.sql`, were applied. Local and development
   migration histories now match.
3. `pronunciation-private` version 1 was deployed with JWT verification enabled.
   `pronunciation-private-cleanup` version 1 was deployed with gateway JWT verification disabled
   and its own Supabase server-secret authentication enabled. The existing
   `pronunciation-public` version 4 deployment was left unchanged.
4. `pg_cron` and `pg_net` were enabled. The active job
   `pronunciation-private-cleanup-hourly` runs at `17 * * * *`.
5. The project URL and existing modern Supabase secret key are encrypted in Supabase Vault. No
   credential is committed in SQL, source, documentation, or Expo configuration.
6. A Vault-backed `pg_net` probe through the same request path used by Cron returned HTTP `200`
   with zero claimed, deleted, failed, or pruned rows.
7. `EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED=false` remains unchanged.

## Production rollout

The separately approved production rollout was completed on August 17, 2026:

1. A read-only audit confirmed that production was healthy and both private-pronunciation
   migrations were already recorded and structurally present. No production migration was pushed.
2. The private metadata table and MP3-only bucket were present, cleanup execution was restricted
   to `service_role`, and private metadata was absent from the PowerSync publication. Production
   PowerSync was not changed.
3. The existing `account-delete` function was left unchanged. `pronunciation-private` version 1
   was deployed with JWT verification enabled, and `pronunciation-private-cleanup` version 1 was
   deployed with gateway JWT verification disabled and server-secret authentication enabled.
4. `pg_cron` and `pg_net` were enabled. The active production job
   `pronunciation-private-cleanup-hourly` runs at `17 * * * *`.
5. The production project URL and its existing modern Supabase secret key are encrypted in the
   production Vault. No development credential was copied to production.
6. Production initially contained zero private assets. A direct empty cleanup and a Vault-backed
   `pg_net` probe both returned HTTP `200` with zero failures.
7. A production-only synthetic test created two temporary accounts and uploaded one 128-byte MP3
   for each without contacting Azure. Cleanup deleted only the expired account's object and
   metadata while retaining the fresh account's data. The remaining synthetic object, metadata,
   and both accounts were then removed. A final query confirmed zero synthetic residue.
8. The client preview flag remains disabled. No Azure synthesis or EAS build was performed.
9. The six production Azure and private-budget Edge Function secrets were subsequently synced
   from the ignored local `.env` file and verified by digest. Secret values were not logged or
   committed. Both pronunciation functions remained active after the configuration restart.
10. A controlled `sk-SK` Azure canary used one temporary production account and the configured
    `sk-SK-ViktoriaNeural` voice. The first request generated a verified private MP3; a second
    identical request returned the same cached asset without another generation. The response,
    downloaded content type, byte length, SHA-256, signed URL, owner-scoped Storage record, and
    budget audit were consistent.
11. Authenticated opt-out removed the canary object, metadata, and audit rows, after which the
    temporary account was deleted. Final counts were zero for all four resources. An aggregate
    query examined 25 recent production log records and found zero occurrences of the synthetic
    canary text in either event messages or structured attributes.

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
- Supabase CLI 2.114.0 successfully serves all four local Edge Functions with Edge Runtime 1.74.3
  (Deno 2.1.4). The cleanup endpoint rejects missing and publishable keys with `401`; a local
  service-secret invocation completes with zero claimed, deleted, failed, and pruned rows.
- The project-pinned Supabase CLI 2.109.1 fails before compilation with `failed to determine
  entrypoint` for both existing and new functions. Local function verification therefore used
  2.114.0 temporarily without changing the project dependency.
- A development-only remote test created two temporary accounts and uploaded one 128-byte
  synthetic MP3 for each account without contacting Azure. Cleanup removed the expired account's
  Storage object and metadata while retaining the fresh account's object and metadata. The test
  then removed the remaining object, both metadata rows, and both temporary accounts.
- A direct authenticated empty cleanup and a Vault-backed `pg_net` cleanup both returned HTTP
  `200` with no failures.
- Expo Doctor reports 18/21. The existing duplicate React and React Native Directory findings
  remain, and the current checker also recommends newer SDK 56 patch versions for thirteen
  dependencies. Phase 5C changes no application dependency.
- No production PowerSync change, EAS build, client flag enable, or private-preview
  physical-device request was performed. The separately approved production Azure canary is
  documented above.

## Privacy, consent, and monitoring readiness

- On August 22, 2026, the project owner confirmed that the current Azure subscription is covered
  by the applicable Microsoft Data Protection Addendum. This records the owner's operational
  confirmation and is not independent legal advice.
- The public privacy policy now describes the explicit opt-in and tap-triggered transfer of the
  exact displayed word or phrase and selected locale to Microsoft Azure Speech, the account-private
  Supabase MP3, and the absence of raw text from Wordfold pronunciation metadata and audit rows.
- The policy and in-app disclosure document the rolling 30-day server-audio expiry, maximum 30-day
  audit retention, immediate opt-out deletion path, retry behavior when offline, and continued
  availability of device pronunciation.
- The consent disclosure version is `2026-08-22`. Any consent stored against the previous version
  is invalidated and must be granted again after the updated disclosure is shown.
- The project owner approved a EUR 5 monthly Azure budget with actual-spend notifications at 50%,
  80%, and 100%, plus a 100% forecast notification to `support@wordfold.app`. The server-side
  10,000-character daily generation cap remains the immediate cost-control boundary; Azure budget
  notifications are monitoring and do not stop usage.

## Remaining release gates

- Create and verify the approved Azure budget notifications in the production subscription.
- Enable the client flag only for an approved Android development pilot.
- Complete iOS validation when a physical iOS device becomes available.

The project owner, a native Slovak and English speaker, approved the production Slovak canary voice
on August 22, 2026.
