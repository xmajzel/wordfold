# Pronunciation Phase 4B: durable offline downloads

Status: **implemented locally July 22, 2026; real-device verification pending**.

## Problem and scope

Phase 4A exposes all 16,600 immutable English pronunciation assets through a pinned index and two
strictly validated locale shards. Phase 4B lets Android and iOS users explicitly download only the
voice and CEFR levels they want, resume partial work, remove packs, and play downloaded files
without an account or network request.

The implementation deliberately uses Expo FileSystem rather than PowerSync Attachments. These are
public, immutable, device-selected assets with no synchronized application record, upload path, or
cross-device ownership. A small custom store avoids adding PowerSync's alpha attachment queue and
React Native storage-adapter dependency to an unrelated public corpus.

## User behavior

Native Settings contains an **Offline pronunciation** destination. The screen presents both current
neural voices:

- English (United States), Ava neural voice: 8,300 assets / 117,902,304 bytes;
- English (United Kingdom), Ryan neural voice: 8,300 assets / 166,187,520 bytes.

Each locale offers A1 through C2 independently and an all-level action. The UI shows exact manifest
word counts and byte totals, current verified file count, aggregate progress, retry/resume state,
and destructive removal. Every operation is confirmed. Only one pack operation runs at a time;
three MP3 transfers may run concurrently inside it.

Cancellation aborts active transfers and retains completed verified files. Relaunch inspection
recovers partial progress from the filesystem. Resume verifies every existing candidate before
skipping it. A 25 MiB free-space reserve is required in addition to the remaining declared pack
bytes.

## Durable storage and integrity

The store is public to every local app account but private to the application container:

```text
Paths.document/wordfold-pronunciation/offline/azure-public-preview-v1/
  <locale>/<level>/
    plan.json
    complete.json
    audio/<content-hash>.mp3
```

`plan.json` is written atomically from a shard that already passed Phase 4A's pinned index, byte,
hash, schema, locale, voice, catalog, completeness, and uniqueness checks. Its exact sorted level
subset contains only catalog sense ID, content hash, MP3 SHA-256, and byte length.

Each audio response is written to a random temporary file in the destination directory. Before the
atomic move, the store requires the declared byte length, an MP3 signature, and the declared
SHA-256. The destination is verified again after the move. `complete.json` is written atomically
only after every planned asset passes. Interrupted temporary files are removed during inspection.
Malformed local metadata fails closed and is removed.

Downloaded packs are outside the 64 MiB transient cache under `Paths.cache`; therefore operating
system cache cleanup and the existing oldest-file eviction cannot remove explicit downloads.
Explicit level or locale removal is the only normal eviction path.

## Playback and access boundary

For eligible catalog English, signed-in neural playback now resolves in this order:

1. verified durable offline file;
2. existing verified transient public cache;
3. authenticated `pronunciation-public` Edge Function.

A signed-out user sees the neural control only when the exact catalog asset exists in a local pack.
The control passes `cloudAllowed: false`; a missing or corrupted local file can never fall through
to the authenticated function. Device speech remains a separate visible option and all existing
locale/voice behavior is unchanged.

## Data and service impact

- No Supabase migration, Storage write, function deployment, or Azure request.
- No PowerSync schema, sync rule, attachment table, or deployment.
- No account identifier, private word, translation, or progress record in pack metadata.
- No new dependency or native permission.
- Pack selection and files remain device-local across sign-in and sign-out.

## Explicit exclusions

- No web download store.
- No automatic download or automatic durable-pack eviction.
- No downloads continuing after application termination. Partial files resume at file granularity.
- No pause/resume of the current HTTP response; cancellation plus verified file-level resume is
  provided.
- No Spanish, German, Greek, Slovak, or private-word neural packs until reviewed assets and pinned
  manifests exist.
- No EAS build or production feature-flag rollout.

## Verification record

- Low-level tests cover exact level plans, atomic verified downloads, completion markers, durable
  lookup, corruption rejection, cancellation-safe partial state, and explicit removal.
- Provider tests cover manifest preparation, aggregate completion, insufficient-storage rejection,
  and cancellation without a false error.
- Screen and component tests cover both voices, confirmation, progress, cancellation, durable-first
  playback, offline-only cloud prohibition, and downloaded guest visibility.
- TypeScript and Expo lint pass. The full Jest suite passes 57 suites and 236 tests. Local Android,
  iOS, and web Expo exports pass; a colocated route test caught and was moved out of `src/app`
  before the final successful export.
- Expo Doctor remains at the existing 19/21 baseline: the Supabase CLI dependency tree contains a
  second React version, and React Native Directory lacks complete metadata for Quick SQLite and the
  two local native modules. Phase 4B added no dependency and introduced neither finding.
- Measured web-fallback QA at 320 px and 390 px reports viewport-equal page width, no unclipped
  overflow, and no tap target below 44 by 44 px. Text contrast passes 4.5:1; the accent icon passes
  the 3:1 non-text threshold. Native pack rows remain part of the physical-device gate because the
  feature intentionally does not render them on web.
- Physical Android and iOS checks remain required for real downloads, cancellation, relaunch
  resume, storage removal, and airplane-mode audio.
- No EAS build, Supabase deployment, PowerSync deployment, Storage mutation, or Azure request was
  performed.
