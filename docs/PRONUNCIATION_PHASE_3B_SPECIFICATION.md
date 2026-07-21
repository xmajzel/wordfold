# Pronunciation Phase 3B: authenticated public-catalog neural preview

Status: **3B.1 and 3B.2 approved and implemented locally**. No remote migration, function
deployment, Azure generation, EAS build, or public rollout has been performed.

## Problem

Wordfold has cacheable Azure neural output and single-native-reviewer provisional choices for
`en-US`, `en-GB`, and `sk-SK`, but the application can currently play only device voices. The next
step must add a narrow cloud path without exposing the Azure key, treating personal vocabulary as
public, weakening account isolation, changing PowerSync, or presenting provisional evidence as
production quality.

The bundled CEFR catalog has 8,300 English entries. Therefore the initial runtime surface can
serve `en-US` and `en-GB` catalog terms. `sk-SK-ViktoriaNeural` remains configured but disabled
until an approved public Slovak catalog or target-translation playback exists.

## Recommended delivery sequence

Implement Phase 3B in two approvals:

1. **3B.1 backend foundation:** local migration, catalog allowlist, Storage bucket, authenticated
   Edge Function, Azure adapter, cost/rate gates, and backend tests. No remote deployment or app UI.
2. **3B.2 client preview:** public MP3 cache/download/playback and an explicitly labelled neural
   preview control alongside the existing device-voice control.

This keeps provider/security behavior testable before the mobile application depends on it.

The local 3B.1 implementation is documented in
`docs/PRONUNCIATION_PHASE_3B_BACKEND.md`. It deliberately leaves the production budget owner,
exact production limits/alerts, and source-license review as deployment blockers.

## 3B.1 expected behavior

### Request contract

`POST /functions/v1/pronunciation-public` accepts an authenticated Supabase user JWT and:

```json
{
  "catalogSenseId": "00023271-n:scope",
  "locale": "en-US"
}
```

- The request never accepts synthesis text, provider, model, voice, Storage path, or a `public`
  scope assertion from the client.
- The function retrieves the canonical term from a server-owned catalog allowlist and accepts only
  `en-US` or `en-GB` in this preview.
- Voice selection is server-owned and versioned: `en-US-AvaNeural` and `en-GB-RyanNeural`.
- A cache hit returns `200`. The request that claims a new identity generates synchronously; a
  concurrent caller receives `202 pending` with a bounded retry hint rather than generating twice.
- Unsupported locale/catalog identity returns `404`; invalid input `400`; missing/invalid session
  `401`; user or global budget exhaustion `429`; a safe provider failure `502`.
- Responses never include provider credentials, raw provider errors, personal data, or mutable
  Storage credentials.

Ready response:

```json
{
  "status": "ready",
  "asset": {
    "id": "uuid",
    "requestKey": "sha256",
    "contentHash": "sha256",
    "sha256": "sha256",
    "byteLength": 12345,
    "contentType": "audio/mpeg",
    "locale": "en-US",
    "synthesisVersion": "azure-public-preview-v1",
    "publicUrl": "https://.../storage/v1/object/public/pron-public/..."
  }
}
```

### Canonical identity

The server hashes the exact canonical term, exact BCP-47 locale, Azure provider, pinned voice,
model/tier, output format, and synthesis version. Catalog sense IDs select canonical input but do
not replace content identity. Files are immutable; a voice/configuration change increments the
synthesis version and creates a new hash.

### Database and Storage

A migration adds server-owned tables outside the PowerSync publication:

- `pronunciation_catalog_inputs`: `catalog_sense_id` primary key, canonical `text`, source/version,
  content-source hash, enabled flag, and timestamps. A deterministic generated migration seeds the
  8,300 committed CEFR entries without definitions, examples, or Slovak hints.
- `pronunciation_assets`: UUID, catalog sense, locale, provider, voice, model/tier, format,
  synthesis version, request key, content hash, SHA-256, byte length, object key, status
  (`pending`/`ready`/`failed`), safe failure code, lease expiry, and timestamps. Request key and
  content hash are unique; ready rows require complete file metadata.
- `pronunciation_requests`: request UUID, authenticated user ID, asset/request key, cache-hit flag,
  billed characters, safe outcome, and timestamp. Retention is bounded and raw JWT/IP/provider
  errors are not stored.

All three tables revoke direct `anon` and `authenticated` mutations. Catalog/asset metadata is
read by the service-role client inside the function only. Database tests prove the resources are
absent from the `powersync` publication and unavailable across the client Data API.

Create a public `pron-public` bucket restricted to `audio/mpeg`, a conservative maximum object
size, and service-owned upload/delete. Public possession of an immutable URL permits download;
bucket listing and all writes remain unavailable to application roles. Objects use
`azure-public-preview-v1/{contentHash}.mp3` and are never overwritten.

### Provider, integrity, and concurrency

- Azure secrets remain Edge Function secrets: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and the
  paid-tier attestation. They are never `EXPO_PUBLIC_*` values.
- The function uses Azure's regional SSML REST endpoint, XML-escapes canonical input, pins the
  exact voice and `audio-24khz-96kbitrate-mono-mp3`, and uses a bounded timeout.
- Generation validates response status/content type, MP3 signature, minimum/maximum bytes, and
  SHA-256 before an atomic upload/final metadata transition.
- An inserted `pending` row is the generation claim. Unique request keys prevent duplicate work;
  an expired lease permits a bounded retry. A failed row contains only an enumerated safe code.
- If Storage succeeds but the metadata transition fails, the next claimant validates/reuses the
  immutable object. No request overwrites a ready object.

### Abuse and budget gates

- Authentication is mandatory for function invocation even though ready audio objects are public.
- Before any Azure request, enforce per-user requests/hour, per-user generated characters/day,
  global generated characters/day, maximum term length, and a single-item request body.
- Cache hits do not consume Azure character budget but are logged and rate-limited against abusive
  invocation volume.
- Limits are server configuration with fail-closed defaults. Production deployment remains blocked
  until the product owner names the budget owner and exact limits/alerts.
- Remote generation and public distribution remain blocked until a written source-license review
  confirms that each enabled catalog's headwords may be submitted to Azure, its generated audio
  may be distributed, and required CEFR-J/Octanove attribution is present in the product.

## 3B.2 client behavior

- Add a neural-preview control only when the word has a `catalogSenseId`, the user is signed in,
  and the source locale is `en-US` or `en-GB`.
- Keep the existing `≈ Device voice` button visible. Never silently replace it or claim that it is
  the neural voice.
- Label cloud playback `Neural voice preview`. Do not use `native`, `perfect`, `correct`, or
  `reference-quality`.
- On tap, check the public cloud cache, call the Edge Function if needed, download into the existing
  public pronunciation namespace, verify declared byte length and SHA-256, move atomically, then
  play through `expo-audio`.
- A `202` response shows `Preparing neural voice…` and permits retry. Network, authorization,
  integrity, or provider failure returns the neural control to idle with an honest error; the user
  can independently choose the device-voice button.
- Public cached cloud audio may survive sign-out. No signed URL or session token is persisted.
- Guest, personal/manual, edited catalog text, unsupported locale, and `sk-SK` remain device-only.
  Catalog eligibility requires the stored catalog sense and exact canonical term to match the
  bundled catalog.
- Web remains device/browser speech during this preview unless separately approved.

Likely client modules: `src/features/pronunciation/cloud.ts`, a narrow public MP3 cache module,
pronunciation controls, the two existing call sites, authentication-aware eligibility, and focused
unit/component tests. Existing native synth-to-file and account cache behavior remain unchanged.

### 3B.2 local implementation

- `EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED=true` enables the control in a native build;
  the committed example defaults it to `false`.
- The client checks a verified public cache before invoking `pronunciation-public`. Ready MP3s are
  accepted only from the configured Supabase public bucket path and only after response-schema,
  byte-length, MP3-signature, and SHA-256 checks.
- The cache persists only immutable public asset metadata and audio under the shared pronunciation
  cache root. It stores no JWT, private text, or signed URL and therefore may survive sign-out.
- Device and neural controls share one playback coordinator, but a neural failure never initiates
  device speech. The user chooses the separately labelled device option.
- Focused tests cover eligibility, response validation, offline-first orchestration, pending retry,
  integrity rejection, signed-in/native visibility, safe error copy, and both playback controls.

## Likely files/modules

- New generated Supabase migration(s), database pgTAP coverage, Edge Function and shared helpers.
- A deterministic catalog-input SQL generator and tests using the committed catalog manifest/hash.
- In 3B.2 only: cloud client/cache modules, pronunciation controls/call sites, and tests.
- Documentation/config updates for local secrets and exact local verification commands.

No pronunciation table is added to the PowerSync client schema, uploader, publication, sync rules,
or account-owned word schema.

## Explicitly unchanged

- No private/manual word text is sent to Azure.
- No translation/target pronunciation, offline collection download, background pre-generation,
  bulk generation, or generation-on-word-insert.
- No PowerSync Attachment integration, private Storage bucket, signed private URLs, or synchronized
  pronunciation state.
- No `de-DE`, `el-GR`, `es-ES`, `es-MX`, or runtime `sk-SK` cloud control.
- No remote migration, Edge Function deployment, Azure generation, EAS build, or public release
  without separate action-time approval.

## Minimal acceptance criteria

- Unauthenticated, arbitrary-text, unsupported-locale, oversized, malformed, and over-budget
  requests fail before provider access.
- Repeated/concurrent canonical requests produce one immutable asset identity and at most one live
  generation claim.
- Ready assets pass content-type, byte-length, MP3, and SHA-256 validation.
- Direct clients cannot mutate catalog inputs/assets/requests or Storage objects; provider secrets
  never enter the app bundle, responses, or logs.
- New tables remain outside PowerSync and existing sync/auth/database regression tests pass.
- 3B.2 shows both honestly labelled choices, supports cache-hit offline replay of already downloaded
  public audio, and leaves ineligible words device-only.
- Local function integration tests use a fake Azure endpoint. Any real paid call, remote Supabase
  mutation, or EAS build requires explicit approval immediately before it happens.

## Sources verified for this draft

- Supabase Edge Function authentication: <https://supabase.com/docs/guides/functions/auth>
- Supabase Edge Function authorization headers: <https://supabase.com/docs/guides/functions/auth-headers>
- Supabase Storage buckets: <https://supabase.com/docs/guides/storage/buckets/fundamentals>
- Supabase Storage access control: <https://supabase.com/docs/guides/storage/security/access-control>
- Azure Speech text-to-speech REST API: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech>
