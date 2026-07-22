# Pronunciation Phase 4A: immutable offline manifest foundation

Status: **implemented, deployed, and remotely verified July 22, 2026**.

## Problem and boundary

The public pronunciation corpus contains 16,600 immutable MP3s, but the client currently discovers
them one at a time through the authenticated Edge Function. Explicit offline downloads must not
make thousands of function calls or put a roughly 271 MiB corpus into the existing 64 MiB transient
cache.

Phase 4A publishes a strictly validated, hash-addressed asset index. It does not download MP3s or
add user-facing controls. Phase 4B will use this contract for durable, user-selected packs under
Expo FileSystem's document directory.

## Manifest contract

The deterministic publication contains one small index and one shard per supported neural locale.
JSON uses a trailing newline and no formatting so identical input produces identical bytes.

Pinned source identity:

- catalog SHA-256: `7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b`;
- synthesis version: `azure-public-preview-v1`;
- provider/model: Azure / Standard Neural S0;
- output: `audio-24khz-96kbitrate-mono-mp3` (`audio/mpeg`).

Published artifacts:

- index: 1,016 bytes, SHA-256
  `71b624deae4c0e4bb03eb70cf083d0ed9e53c51d03cc7cf7f8d2efcb7f636d60`;
- `en-US`: 8,300 assets, 117,902,304 audio bytes, 1,357,245 manifest bytes, SHA-256
  `f76e52b240477806182b4b3dfb5a873c73c8638d37a2ca0a10fbc7d0ae34cc61`;
- `en-GB`: 8,300 assets, 166,187,520 audio bytes, 1,357,249 manifest bytes, SHA-256
  `8609e0eb614c2348a983cd95da097984a7d5ddf94597d285d945d1fefde5a79f`.

Each shard row is a compact tuple of catalog sense ID, content hash, audio SHA-256, and byte length.
It contains no synthesis text, definitions, translations, user data, request audit, database UUID,
provider credential, or mutable URL. The client derives exact public MP3 URLs from the configured
Supabase origin and validated content hash.

The index pins each shard's locale, voice, count, total audio bytes, JSON byte length, SHA-256, and
immutable object path. Every index and shard object path contains its own content SHA-256.

## Generation and publication

`scripts/pronunciation-offline-manifest.mjs` supports:

```sh
# Deterministic local fixture/input build
pnpm pronunciation:offline-manifest -- build --input rows.json --output directory

# Exact read-only export from the linked development database
pnpm pronunciation:offline-manifest:export

# Verify local artifact byte lengths and hashes
pnpm pronunciation:offline-manifest:verify

# Explicit remote publication after the bucket migration exists
pnpm pronunciation:offline-manifest -- publish --execute
```

The linked export fails unless both locales contain every one of the 8,300 pinned catalog
identities with ready status, exact provider/voice/model/format/version, unique request keys,
canonical object paths, valid hashes, and bounded byte lengths. Publication first checks for an
existing hash-addressed object, refuses mismatched content, uploads only missing objects, and
downloads each result again to verify its bytes and SHA-256.

## Storage and client trust boundary

Migration `20260722090000_create_pronunciation_manifest_bucket.sql` creates a separate public
`pron-manifests` bucket restricted to `application/json` and 8 MiB per object. The existing
`pron-public` bucket remains MP3-only. Application roles receive no Storage write policy, and
manifest data remains outside PowerSync.

The client pins the exact index path, byte length, and SHA-256. It accepts only HTTPS on the
configured Supabase origin, exact bucket/object paths, `application/json`, exact lengths and hashes,
the known schema/catalog/version/locales/voices/counts/sizes, and a sorted complete set of bundled
catalog identities. Any network, origin, content-type, integrity, schema, completeness, uniqueness,
or size failure is rejected without changing existing on-demand pronunciation.

## Explicit exclusions

- No audio-pack directory, download queue, progress, pause/resume, cancellation, eviction, or UI.
- No changes to the existing on-demand Edge Function or transient public cache.
- No PowerSync Attachment integration or pronunciation replication.
- No full-corpus automatic download, private cloud pronunciation, production rollout, or EAS build.

## Acceptance criteria

- Two builds from identical complete rows produce byte-identical index and shard artifacts.
- Altered/incomplete backend rows and client manifests fail closed.
- Remote objects return `application/json` and exactly match pinned lengths and hashes.
- The migration is applied and remotely linted; application roles cannot write manifest objects.
- TypeScript, Expo lint, full Jest, deterministic export/verify, local Expo export, and source
  self-review pass without an Azure request.

## Deployment and verification record

- Migration `20260722090000_create_pronunciation_manifest_bucket.sql` is recorded on the linked
  development project. Remote schema lint reports no errors.
- Exact SQL verifies one correctly constrained public bucket, three JSON objects, 2,715,510 stored
  manifest bytes, and zero anonymous/authenticated Storage write policies.
- The publisher uploaded the pinned index and two locale shards, then downloaded each object and
  verified `application/json`, exact byte length, and SHA-256. A second execution performed no
  uploads and verified the existing immutable objects successfully.
- Two deterministic linked exports produced the same index and shard identities documented above.
- TypeScript and Expo lint pass; the full Jest suite passes 54 suites and 223 tests; Android local
  Expo export passes. No EAS build, MP3 generation, Azure request, or PowerSync deployment occurred.
- Local pgTAP was not rerun because Docker Desktop still does not share this repository directory;
  the migration itself was applied to the linked project and verified through remote SQL and lint.
