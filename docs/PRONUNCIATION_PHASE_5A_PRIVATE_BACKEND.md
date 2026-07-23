# Pronunciation Phase 5A private backend

Status: **implemented locally, not deployed** (July 22, 2026). This phase creates the private
server path only. No application screen or setting can invoke it yet.

## What exists

- An authenticated `pronunciation-private` Edge Function for exact `en-US`, `en-GB`, and `sk-SK`
  synthesis using the provisionally selected Azure voices.
- A strict `POST` body containing only `{ "text": string, "locale": string }`. Text must be 1–200
  characters, must already be trimmed, and cannot contain control characters. Unsupported locales
  and extra fields are rejected.
- A user-specific request key and object path. Identical text from two accounts has a different
  hash and can never resolve to the other account's asset.
- A private, MP3-only `pron-private` Storage bucket. The function returns a newly signed URL with a
  60-second lifetime; there are no anonymous/authenticated Storage policies and no public URL.
- Service-owned metadata, generation leases, immutable upload, content-type/size/SHA-256 checks,
  safe failure codes, and account-isolation checks.
- The existing request ledger now distinguishes `public` and `private` requests. Both paths share
  the same hourly request and daily generated-character limits, including the global ceiling.
- An authenticated `DELETE` operation that validates and removes only the caller's private Storage
  objects, then removes that caller's private asset metadata and private audit rows. Public usage
  records and other accounts remain untouched.

The function accepts raw text because Azure must receive the synthesis input, but raw text is used
only during that request. It is not placed in database rows, object paths, audit rows, application
logs, or API errors by this implementation. Azure states that real-time text-to-speech does not
retain the input text or generated audio in its service; this is still subject to the project's
Azure configuration and contract. See [Azure Speech data privacy and security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security).

Supabase documents that private bucket assets require either an authenticated download or a signed
URL. This implementation uses server-created signed URLs only. See [Storage bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)
and [private asset downloads](https://supabase.com/docs/guides/storage/serving/downloads).

## API contract

`POST /functions/v1/pronunciation-private`

```json
{ "text": "súkromné slovo", "locale": "sk-SK" }
```

A completed or cached request returns `200` with verified asset metadata and a short-lived signed
URL. Concurrent generation returns `202` with a two-second retry hint. Authentication, validation,
budget, provider, audio, and availability failures expose only bounded error codes.

`DELETE /functions/v1/pronunciation-private` returns `204` after the current account's private
pronunciation data is removed. Storage deletion happens before metadata deletion so a partial
failure does not orphan an undiscoverable private object.

## Data lifecycle and isolation

- Private asset rows carry a rolling `expires_at` value 30 days after last access.
- Request audit rows continue to use the existing 30-day cleanup window.
- Explicit opt-out deletion is implemented by the private endpoint.
- Scheduled deletion of expired private assets and their Storage objects is implemented locally in
  Phase 5C but is not deployed or scheduled. See
  `docs/PRONUNCIATION_PHASE_5C_RETENTION_AND_ROLLOUT.md`.
- Private metadata is excluded from the PowerSync publication, and application roles cannot query
  it directly.
- Account deletion cascades private metadata through the owner foreign key. A production account
  deletion workflow must invoke the private endpoint first so Storage objects are also removed.

## Configuration

The private function deliberately reuses the existing server-only Azure and budget settings:

```text
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
AZURE_SPEECH_TIER=S0
PRONUNCIATION_USER_HOURLY_REQUEST_LIMIT
PRONUNCIATION_USER_DAILY_CHARACTER_LIMIT
PRONUNCIATION_GLOBAL_DAILY_CHARACTER_LIMIT
```

No provider credential is added to Expo or exposed with an `EXPO_PUBLIC_` name. The fake-provider
endpoint remains available only when `PRONUNCIATION_FAKE_PROVIDER=true` for local tests.

## Release gates

- **Implemented locally in Phase 5B:** application consent, disclosure, verified account-private
  playback/cache behavior, and retryable opt-out UI. The client remains feature-flagged off and
  not deployed; see `docs/PRONUNCIATION_PHASE_5B_PRIVATE_CLIENT.md`.
- Deploy and schedule the locally implemented Phase 5C expiry cleanup after explicit approval.
- Update the privacy policy and confirm the applicable [Microsoft Products and Services DPA](https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA)
  before any user-entered text is sent to Azure.
- Set production limits/alerts and run account-isolation tests against the linked development
  project before production exposure.
- Obtain immediate approval before a real Azure request or any remote Supabase migration/function
  deployment.
- Complete iOS verification when a device is available. No EAS cloud build is authorized here.

## Verification

The local migration applies from a clean reset. The private pgTAP suite (22 checks), the existing
public-pronunciation pgTAP suite (29 checks), and the existing database/PowerSync suite (57 checks)
pass. The Edge Function core tests cover authentication, strict input, all three voices, absence of
raw text in repository calls, per-user hashing, cache hits, shared budget denial, owner-scoped
deletion, safe provider failures, and Slovak SSML escaping. All 58 Jest suites (254 tests),
TypeScript, Expo lint, Deno Edge Function checking, schema lint, offline-manifest verification, and
the Android/iOS/web Expo export pass. Expo Doctor remains at the pre-existing 19/21 baseline.
