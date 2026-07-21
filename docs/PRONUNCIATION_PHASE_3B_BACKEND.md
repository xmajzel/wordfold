# Pronunciation Phase 3B.1 backend foundation

Status: **implemented and verified locally; not deployed** (July 21, 2026).

## What exists

- A deterministic service-owned allowlist of all 8,300 committed CEFR catalog entries. The
  generated SQL records catalog SHA-256
  `7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b` and includes only catalog
  identity, canonical term, source, source version, and source hash.
- Server-only asset and request-audit tables with RLS, explicit privilege revocation, immutable
  content identity, generation leases, safe failure codes, transactional request/character
  budgets, and automatic 30-day request-audit retention.
- A public, MP3-only `pron-public` Storage bucket with a 1 MiB object limit. Application roles
  cannot list or write objects; immutable object URLs are public by design.
- An authenticated `pronunciation-public` Edge Function. It accepts only `catalogSenseId` and
  `locale`, retrieves canonical text server-side, and enables only `en-US` and `en-GB`.
- Pinned provisional voices `en-US-AvaNeural` and `en-GB-RyanNeural`, Azure S0 attestation,
  pinned output format, XML escaping, a 10-second timeout, MP3/content-type/size/SHA-256 checks,
  immutable upload, cache-hit handling, and single-claim concurrency.
- Conservative local defaults: 20 requests/user/hour, 1,000 generated characters/user/day, and
  10,000 generated characters globally/day. Production values and alerts remain an explicit
  product-owner decision.

The function never accepts synthesis text or a provider/voice/path from the client. Personal or
manually entered vocabulary remains outside this cloud path. `sk-SK` remains disabled at runtime
until there is an approved public Slovak input surface.

## Local configuration

Copy `supabase/functions/.env.example` to an ignored local env file and fill values locally. Do
not use `EXPO_PUBLIC_` names for provider credentials.

```sh
pnpm db:start
pnpm db:reset
pnpm exec supabase functions serve pronunciation-public --env-file supabase/functions/.env.local
```

`PRONUNCIATION_FAKE_PROVIDER=true` permits the explicit local `AZURE_SPEECH_ENDPOINT` override.
When false, the function always builds Azure's regional HTTPS endpoint and ignores the override.

## Verification

```sh
pnpm pronunciation:catalog-sql -- --check
pnpm test -- public-edge-core.test.ts catalog-sql.test.js
pnpm db:test
pnpm db:lint
pnpm typecheck
pnpm lint
pnpm test
pnpm dlx deno@2.9.3 check --config supabase/functions/deno.json \
  supabase/functions/pronunciation-public/index.ts
```

Docker Desktop must share the repository path for `supabase test db` and `supabase functions
serve`. If that is unavailable, the same pgTAP files can be copied into the local database
container and run with `psql`; this was the local verification fallback used during 3B.1.

## Still blocked

- No remote Supabase migration or function deployment.
- No real Azure call or paid usage.
- No production limit/alert values or named budget owner.
- No written source-license approval covering provider submission, generated-audio distribution,
  and required CEFR-J/Octanove attribution.
- No Phase 3B.2 client control, download cache, or playback integration.
- No EAS cloud build.

These are deliberate release gates, not missing backend behavior.
