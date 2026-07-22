# Architecture Review: Multilingual Pronunciation for Wordfold

> Honest, skeptical architecture review. Grounded in the current repo state and verified
> against official platform/provider documentation (July 2026).
>
> Claim tags: **[FACT]** = verified in code or official docs · **[INFER]** = reasoning ·
> **[REC]** = recommendation.

---

## 0. Grounding facts that reshape the whole review

A few things from the actual repo change the framing of the proposal materially:

- **[FACT] Supabase Auth/Postgres and PowerSync Cloud now exist.** Signed-in users have an
  authenticated, per-user offline data plane; guest mode remains local-only. Phase 4C is
  implemented locally, although authenticated airplane-mode/reconnect and two-device recovery
  remain release-verification gates (`docs/SUPABASE_POWERSYNC_SPECIFICATION.md:5`).
- **[FACT] The synchronized surface is intentionally narrow.** Only `collections`, `words`, and
  `learning_events` are in the Postgres publication, PowerSync replication-role grants, sync
  stream, client schema, and uploader. **[IMPLEMENTED LOCALLY]** Phase 3B.1 adds server-owned
  pronunciation tables, public immutable Storage, and an authenticated Edge Function outside
  PowerSync; none of those changes has been deployed remotely.
- **[IMPLEMENTED LOCALLY] Phase 0 multilingual identity is complete.** Guest SQLite v7 and the
  additive Supabase migration allow multiple senses, index soft-duplicate checks by user/source
  language/normalized term, and store exact source and target pronunciation locales. The
  Supabase migration and PowerSync stream change still require their normal controlled remote
  rollout.
- **[IMPLEMENTED LOCALLY] Language and locale are explicit create/edit inputs.** The initial
  supported set is English (`en-US`, `en-GB`), Spanish (`es-ES`, `es-MX`), German (`de-DE`),
  Greek (`el-GR`), and Slovak (`sk-SK`). Guest import and cutover preserve separate rows instead
  of treating equal normalized terms as conflicts; legacy conflict checkpoints remain resumable.
- **[IMPLEMENTED LOCALLY] Runtime normalization is shared and language-aware:** NFKC, trim,
  whitespace collapse, then locale-aware lowercasing. Catalog build output already follows the
  same NFKC/case behavior for its fixed English data.
- **[FACT] A custom Expo native module already ships** (`modules/wordfold-translate`,
  Swift + Kotlin). Adding a native TTS-to-file module is well within existing capability — this
  unlocks an option the proposal underweights.
- **[IMPLEMENTED LOCALLY] Phase 1 live playback and Phase 2 device caching are implemented.**
  Expo Speech and Expo Intent Launcher provide exact-locale live playback and Android voice
  installation guidance. A narrow `wordfold-pronunciation` module uses Android
  `TextToSpeech.synthesizeToFile()` and iOS `AVSpeechSynthesizer.write()` for cache misses;
  `expo-audio` plays validated cached files. Expo Speech itself remains playback-only: no
  synthesize-to-file, SSML, or IPA/phoneme input.
- **[IMPLEMENTED LOCALLY] Phase 3A provider-bakeoff tooling is complete.** A versioned 30-item
  candidate corpus for each configured locale, pinned Google/Azure voice matrix, conservative
  cost planner, paid-generation gates, resumable checksummed output, separate blinded review
  package/private key, and two-rater scoring are implemented. Three locales are native-approved;
  four carry an explicit best-available non-native provisional review that permits screening but
  not a native-validation claim. A Google run produced 180 samples before stopping at `es-MX`:
  Google's live catalog returned no exact `es-MX` voice. Azure then generated and validated all
  420 planned samples and a blinded reviewer package. One native English/Slovak reviewer completed
  180 ratings for `en-US`, `en-GB`, and `sk-SK`. Engineering may use three explicitly provisional
  Azure defaults, but the scorer correctly keeps `canRecommend: false`; four locales remain
  unrated and no production winner exists.
- **[FACT] PowerSync's React Native SDK is installed at `1.35.9`, but no attachment table or
  React Native attachment-storage adapter is configured.** The current built-in JavaScript/
  TypeScript attachment helpers are marked alpha. They are an option, not an existing subsystem.

---

## 1. Overall verdict

**The pronunciation product strategy — cloud-neural-cached + labeled device fallback +
device-only mode — is sound. Phase 0 now supplies multilingual identity and exact pronounceable
locale semantics, and Phases 1–2 now provide exact-locale device playback plus an isolated local
file cache. The later cloud/download phases still require trust-boundary, provider-quality, and
file-delivery decisions. Silent quality fallback remains the most dangerous product risk.**

Two structural problems dominate:

1. **The current backend is a foundation, not a finished pronunciation pipeline.** Adding a
   replicated table requires coordinated changes to the Postgres publication, replication-role
   grants, PowerSync stream, client schema, uploader behavior, RLS, and tenant-isolation tests.
   The minimal cloud version should avoid that surface until cross-device pronunciation state is
   a demonstrated requirement.
2. **The unit of pronunciation is wrong.** The design implicitly treats "a word row" as the
   pronounceable thing. It isn't. Pronunciation is a function of *(exact original text, language,
   sense)* — and `normalized_term` is lossy in exactly the ways that destroy pronunciation
   correctness ("Polish"/"polish", "US"/"us", "read"/"read"). Keying cache off the word row or
   normalized term will produce confident wrong audio.

One-line recommendation: **Ship exact-locale device playback first, add a namespaced local file
cache, then use Supabase Edge Functions + Storage for server-owned cloud audio fetched on demand;
do not add pronunciation to PowerSync until offline request queuing or cross-device pronunciation
state genuinely requires it.**

---

## 2. Blockers (must fix before building this)

**B1 — `normalized_term` uniqueness was incompatible with multilingual vocabulary.
[RESOLVED LOCALLY]**
Same spelling collides across languages and senses: `gift` (EN present / DE poison), `chat`
(EN / FR cat), `pie`, `sensible` (EN/ES/FR, opposite meanings). Today a user literally cannot
have the English word "chat" and later the French "chat." The moment you go multilingual or
multi-tenant this constraint corrupts data or rejects valid inserts. The fix must cover both
databases, create/edit inputs, conflict keys, guest import, cutover, and tests. A language-pair
unique key is the minimum improvement, but it still rejects multiple senses of the same spelling;
decide explicitly between sense-aware uniqueness and soft dedup. Phase 0 chose soft dedup and
updated guest SQLite, Supabase, import/cutover, manual warnings, and tests.

**B2 — Pronunciation must not be keyed on the word row or `normalized_term`. [INFER/blocker]**
`normalizeTerm` lowercases and collapses whitespace, so it cannot distinguish heteronyms or
casing-dependent readings. The cache key must be built from the **original `term`/`translation`
text/effective synthesis input + BCP-47 locale + voice + provider + model + phoneme/SSML
override** — which the proposal's
"cache identity" list already gets right. The blocker is *organizational*: pronunciation is a
separate entity from `words`, linked many-to-one, and derived from raw text. Bake that in from
day one.

**B3 — "Best Available" silent fallback violates the core promise. [INFER/blocker]**
If the app plays a system voice while cloud audio is pending, and that system voice is missing or
wrong-locale, the learner memorizes a wrong pronunciation *believing it's the reference*. The
device-fallback audio **must be visually labeled** ("≈ device voice") and **must never** play a
wrong-language voice (see B4). Silent, unlabeled fallback is the one thing a "reliable reference"
app cannot do.

**B4 — Wrong-locale voice is worse than no voice, and expo-speech will happily produce it.
[FACT+INFER/blocker]**
`Speech.speak(text, { language })` does not guarantee the utterance used a voice for that
language; if no matching voice is installed the platform substitutes. **[FACT]** expo-speech
exposes `getAvailableVoicesAsync()` returning `{identifier, language, name, quality}`. **[REC]**
Enumerate voices, match the exact BCP-47 tag yourself, and select a known matching voice;
otherwise report "voice not installed" with install guidance. This is the concrete
answer to "users may learn a language whose voice isn't installed." Android voices also expose
whether a network connection is required, but Expo Speech's `Voice` type does not expose that
flag. Strict offline mode may therefore require a small native voice-enumeration bridge in
addition to expo-speech. Validate exact locale, offline capability, and real playback on devices.

**B5 — The learning-language field and locale must be explicit. [RESOLVED LOCALLY]** The model
maps `term` to `sourceLanguageCode` and `translation` to `targetLanguageCode`. For a Slovak
user learning Spanish, Spanish is normally the source `term`; calling the translation the
"target word" reverses the model. Pronounce `term` using its source locale in v1. If translation
playback is later added, model it as a separate `(word, field)` link. Generic codes such as `es`
or `en` are not sufficient for exact voice selection; pronunciation needs a BCP-47 locale/accent
such as `es-ES`, `es-MX`, `en-GB`, or `en-US`; Phase 0 now stores these exact locales.

**B6 — Cloud asset metadata must be server-owned. [INFER/blocker]** Clients must not be able to
write trusted `provider`, `voice`, `model`, `content_hash`, checksum, or Storage-path metadata.
An authenticated client may request generation, but only the Edge Function/service may create or
finalize an asset row. Otherwise a client can fabricate a cache hit, bypass generation controls,
or point another client at untrusted content.

**B7 — The current PowerSync uploader rejects pronunciation operations. [FACT/blocker]** It
supports only `collections`, `words`, and `learning_events`; an unknown table or operation throws
(`src/data/sync/uploader.ts:96`). The first cloud version should request generation directly from
an authenticated Edge Function. If offline-queueable pronunciation requests are added later,
their table, RLS, uploader behavior, rejection UX, publication, grants, stream, schema, and tests
must be specified together.

**B8 — Azure free tier grants no output-use rights. [FACT]** Per Microsoft's product terms, TTS
output commercial-use rights attach to the *paid* tier only. If Azure is chosen, you cannot ship
on F0. Budget for S0 from day one or don't pick Azure.

**B9 — "Licensed human dictionary recordings" is not a caching-safe drop-in. [FACT/INFER]** Human
recording sets (Forvo-style) are licensed per-clip and typically forbid permanent
redistribution/local caching without a specific redistribution license. Treat this as a
separately-negotiated content deal, not a provider swap. Do not design the cache assuming you may
persist arbitrary licensed human audio.

---

## 3. High-severity risks

- **R1 — The Edge Function is a metered money faucet.** Any authenticated client can POST
  arbitrary text and bill you at the provider. Without server-side dedup, per-user character
  budgets, length caps, and rate limits, one script (or one 50k-word paste) drains your
  quota/wallet. **[REC]** Function must be cache-first (content-hash lookup before any provider
  call), idempotent, rate-limited, budget-capped per user/month, and length-bounded.
- **R2 — Bulk import × on-insert generation = quota incineration.** `addWords`
  (`src/data/repository.ts:83`) and the import screen create words in bulk. Generating on insert
  means a 2,000-word paste fires 2,000 TTS calls, most for words never reviewed. **[REC]** Never
  generate on insert.
- **R3 — Cross-user cache-hit timing leak for private words.** If you globally dedup *all* text
  (including private user phrases), user A can detect that user B synthesized a specific private
  phrase via a suspiciously instant cache hit. **[REC]** Global dedup only for public/catalog
  text; private text is namespaced per user and never shared.
- **R4 — Privacy/GDPR: user phrases sent to a third party.** User-entered words/sentences can be
  personal data. Sending them to Google/AWS/Azure is third-party processing requiring disclosure
  + a DPA, and the provider may log inputs. **[REC]** Default cloud generation to *catalog/public*
  words; make cloud for *private* words explicit opt-in. "Device Only" guarantees that Wordfold
  does not call its configured cloud provider; a stricter offline/privacy mode must additionally
  require a verified offline-capable system voice.
- **R5 — Divergent normalization (NFKC vs none) was a latent data-integrity bug (resolved in
  Phase 0).** Build-time
  catalog terms are NFKC-normalized; runtime user terms are not. Visually identical terms can
  mismatch on lookup/dedup and (if not careful) on cache keys. **[REC]** Unify on one
  normalization module, shared by runtime and scripts, before layering anything on top.
- **R6 — Expanding the synchronized surface without a cross-device requirement is the
  over-engineering risk.** Supabase and PowerSync exist, but that does not make every new entity a
  synchronization entity. On-demand server-generated audio can use Edge Functions, Storage, and
  a disposable local cache without changing the PowerSync data plane.
- **R7 — Private audio can survive account transitions.** PowerSync rows are cleared on account
  change/sign-out, but filesystem audio and local cache metadata are outside that lifecycle.
  **[REC]** Separate public, guest, and account-private cache namespaces; clear private files and
  signed URL material on manual sign-out and automatic account/session transitions.
- **R8 — Tombstones do not trigger FK cascades.** Word deletion is a synchronized tombstone, not
  a physical delete. Pronunciation links must be filtered/tombstoned explicitly. Shared immutable
  assets need delayed mark-and-sweep retention and must never be deleted merely because one word
  or device stopped referencing them.
- **R9 — The sync foundation is not fully release-proven.** Authenticated native cutover,
  airplane-mode mutation/reconnect, sign-out with pending writes, and two-device recovery remain
  deferred. Pronunciation should not depend on unverified sync behavior for its first release.

---

## 4. Recommended architecture

**A device-first playback path with a narrow, server-owned cloud upgrade. Supabase is used where
it adds value; PowerSync is not expanded merely because it is available.**

**Layer 0 — Live device playback (first shippable feature).**
- Pronounce the learning-language `term` with its exact configured BCP-47 source locale.
- Enumerate installed voices before playback. If there is no exact supported match, show voice
  installation guidance; never permit the platform to substitute an unknown locale silently.
- Treat "system voice" and "offline voice" as different properties. Android explicitly models
  network-required voices, while Expo Speech does not surface that flag. Strict offline mode may
  need the native voice bridge described in B4.
- Works in both guest and signed-in stores because it is independent of persistence and sync.

**Layer 1 — Namespaced, content-addressed device cache.**
- Store files by a **content hash** of `(exact effective synthesis input,
  BCP-47 locale, provider, voice, model version, format)`. A sense may select a different
  phoneme/SSML input, but a sense ID or `term`/`translation` field alone should not duplicate
  byte-identical pronunciation. Never key audio by `word_id` or `normalized_term` alone.
- Separate `public`, `guest`, and `account/{user_id}` filesystem namespaces. Store durable asset
  identity and checksums, never signed URLs as durable credentials. Public catalog cache may
  survive sign-out; account-private cache must not.
- For device-generated files, the existing native-module pattern can expose Android
  `TextToSpeech.synthesizeToFile()` and iOS `AVSpeechSynthesizer.write(_:toBufferCallback:)`.
  Validate output format, voice behavior, and file playback on real Android and iOS devices.

**Layer 2 — On-demand cloud neural TTS through Supabase.**
- An authenticated, cache-first, rate-limited Edge Function accepts exact text, field, locale,
  optional sense/override, and requested mode. It validates input, computes the canonical cache
  identity server-side, looks up or generates audio, validates the result, writes immutable
  Storage + Postgres metadata, and returns an asset descriptor plus a public or short-lived signed
  URL.
- Asset metadata is service-write-only. The client downloads on demand into Layer 1. Word
  create/edit/import never generates audio and never waits for pronunciation.
- Start with public catalog/CEFR/publisher terms. Private user text remains device-only unless the
  user explicitly opts into cloud processing.
- A client cannot declare arbitrary text "public." For public generation it supplies a catalog
  identity and the server retrieves or verifies the canonical text/locale. Only explicitly opted-in
  private generation accepts user text and stores it in the per-user namespace.

**Layer 3 — Optional synchronized pronunciation state.**
- Add a per-user request/link table only if offline request queuing, cross-device selections, or
  collection-download state proves valuable. Do not sync the entire global asset catalog.
- Adding this layer requires coordinated changes to the publication, replication role, sync
  stream, client schema, uploader, RLS, tombstones, tenant tests, and sign-out lifecycle.

**Provider for Layer 2: choose by a measured launch-locale bakeoff.** Amazon Polly and Google
Cloud TTS are candidates; Azure requires paid-tier output rights (B8). **[FACT]** Polly's
terms are the most caching-friendly ("cache and replay at no additional cost, no restrictions on
storing"), but a provider is not acceptable unless it covers every launch locale/accent at the
required quality. Verify the current contract before launch because terms and voice catalogs
change.

**Modes, redefined for honesty:**
- **Device Only** → Layers 0+1. Wordfold does not send user text to its configured cloud TTS
  provider. Reports missing or network-required voices. When strict offline/privacy mode is
  selected, play only a voice verified as offline-capable. Default for
  privacy-sensitive users and private words.
- **Best Available** → adds Layer 2; device audio is the labeled interim,
  **never** a silent wrong-locale substitution.

---

## 5. Suggested Postgres / Storage / PowerSync data boundaries

*(For Layer 2. These are new pronunciation resources; the account/sync foundation already
exists.)*

**Postgres**
- `pronunciation_assets`: immutable server-owned metadata: `id`, `scope` (`public`/`private`),
  nullable `owner_user_id`, canonical `content_hash`, exact effective synthesis input, BCP-47
  `locale`, `provider`, `voice`, `model_version`, `format`, `duration_ms`, `sha256`, `object_key`,
  `created_at`. Enforce public/private ownership invariants and separate public-global versus
  per-owner private uniqueness. **No client insert/update/delete.**
- Optional server-side request/usage records hold idempotency, status, rate-limit, character, cost,
  failure, and audit data. Do not publish provider credentials or raw provider errors to clients.
- Do not add a synchronized `word_pronunciations` table in the initial cloud version. The Edge
  Function resolves deterministic assets on demand. Add a per-user link/request table only for a
  concrete offline/cross-device use case.

**Storage (two namespaces, two trust levels)**
- `pron-public/` — path = `{content_hash}.{ext}`. Truly public or long-TTL signed. Globally
  shared; one file serves all users.
- `pron-private/{user_id}/{content_hash}.{ext}` — RLS/bucket-policy scoped; short-TTL signed URLs.
- Files are immutable, content-addressed, checksummed. Regeneration = new hash, never overwrite.
- The client persists only the object/asset identity and verified local URI. A signed URL expires
  and must never become the durable cache key.

**PowerSync**
- **Initial cloud version:** no pronunciation table is published or synchronized. This avoids
  changing the current three-table uploader and tenant boundary for a disposable file cache.
- **Later, if justified:** synchronize only user-referenced links/requests or a deliberately
  selected catalog subset. Never auto-subscribe every client to all global asset metadata.
- **Attachments:** built-in helpers can manage a local-only attachment table, retries, integrity,
  and cleanup, but the JavaScript/TypeScript feature is currently alpha and requires a React
  Native storage adapter. Evaluate it for explicit collection downloads. For immutable,
  server-generated, play-on-demand files, a small signed-URL download/cache layer is the less
  invasive first choice.

**Lifecycle and deletion**
- Clear account-private audio/cache metadata during both manual sign-out and automatic account
  transitions; public catalog audio may remain. Guest files must never be reclassified as private
  account files merely because guest vocabulary is imported.
- Word tombstones make pronunciation links inactive but do not immediately delete shared assets.
  Reclaim unreferenced private/shared objects through a bounded server-side mark-and-sweep policy.

---

## 6. Playback & generation state machines

**Playback**
```
Idle
 └─▶ ResolveLocalCache(hash)
       ├─ hit ─────────────▶ Playing ─▶ (Done | Stopped | PlaybackError→Idle)
       └─ miss ─▶ SelectMode
            ├─ DeviceOnly ─▶ MatchExactVoice(locale)
            │      ├─ found ─▶ (optional synth-to-file → cache) ─▶ Playing
            │      └─ none  ─▶ VoiceMissing(show install guidance)   [never substitute]
            └─ BestAvailable ─▶ RequestCloud(if online & allowed)
                   ├─ ready ─▶ Download + Verify + AtomicCache ─▶ Playing(cloud label)
                   ├─ pending + exact device voice ─▶ Playing(labeled "≈ device")
                   └─ pending + no exact voice ─▶ Unavailable(labeled; cloud pending/retry)
```
Invariant: **no state ever plays a non-matching-locale voice.** Cloud arrival upgrades silently
*upward* (next tap is a cache hit); quality never silently degrades mid-promise.

**Generation**
```
Requested
 └─▶ ComputeContentHash
 └─▶ GateChecks(auth/scope? online? under budget? length ok? not rate-limited?)
       ├─ fail ─▶ Unavailable/Pending(reason) [word still fully usable]
       └─ pass ─▶ EdgeFunction(validates + recomputes canonical identity)
 └─▶ DedupLookup(public catalog or user-private namespace)
       ├─ exists ─▶ AuthorizeRead ─▶ ReturnAssetDescriptor
       └─ absent ─▶ Enqueue
            └─ Generating(provider, idempotent by server hash)
                       └─ Validate(duration>0, sha256, format)
                            ├─ fail ─▶ Retry(backoff, bounded) ─▶ Failed(reason, surfaced)
                            └─ pass ─▶ UploadImmutableStorage ─▶ WriteMetadata
                                      ─▶ ReturnAssetDescriptor
 └─▶ ClientDownload(public/signed URL) ─▶ Verify(sha256) ─▶ AtomicCache ─▶ Ready
```
Invariant (matches the proposal, keep it): **word create/edit never blocks on and never fails due
to generation.**

---

## 7. Pronunciation quality strategy (the correctness cases)

The hard truth: **most of these cannot be solved by "pick a better TTS."** They're
*linguistic-unit* problems, and plain-text TTS APIs (including expo-speech, which has **[FACT]**
no SSML/IPA) can't fix them without markup you mostly can't send.

- **Heteronyms** (lead, read, tear, bass, wind, live; and other-language equivalents):
  unsolvable from `normalized_term`. Requires a **sense**. **[REC]** Key pronunciation on
  `senseId` (you already have `catalog_sense_id` and a senses catalog) so "lead (metal)" and
  "lead (guide)" get distinct audio. For user words without a sense, accept ambiguity and label it.
- **Senses generally**: text + locale is the base identity, but a sense can select a distinct
  pronunciation variant. The catalog already has senses — use them when they disambiguate a
  heteronym, without requiring every ordinary pronunciation to be sense-owned.
- **Inflections/phrases**: TTS handles running text acceptably; single-word citation form may
  differ from in-phrase prosody. Pronounce the displayed learning `term` in v1 and store the exact
  synthesized text. Add lemma pronunciation later only if the product exposes a distinct lemma.
- **Proper names / loanwords / abbreviations** ("USA", "Dr.", "AI", "café"): neural TTS is
  inconsistent and language-dependent; abbreviations especially ("US" the country vs "us"). No
  reliable automated fix. **[REC]** Allow a per-entry **phoneme/SSML override** *field in the data
  model now* (part of the cache key) even though the UI is deferred — so overrides don't force a
  schema migration later. Cloud providers (Polly/Google) accept SSML; expo-speech does not, so
  overrides only take effect on cloud audio.
- **Regional accents** (en-US vs en-GB, es-ES vs es-MX): must be an explicit `accent` dimension in
  the key (you have it). Don't conflate with `language_code`.

**Bottom line:** the quality strategy is (1) sense-aware variants, (2) accent as a first-class
dimension, (3) a reserved override field, and (4) a fixed corpus with two independent native
raters per locale — not raw provider marketing.

---

## 8. Measurable acceptance criteria (per supported locale)

For each launch locale `L`, gate release on:

1. **Voice detection:** exact-BCP-47 voice for `L` and its offline/network requirement correctly
   detected on ≥95% of a real-device test matrix (min 3 Android OEMs + 2 iOS versions).
2. **No wrong-locale playback:** in 100% of "voice-not-installed" test cases, app shows
   "unavailable/install" — 0 substitutions. (Hard gate.)
3. **Cloud coverage:** chosen provider offers a neural voice for `L` + each supported accent.
4. **Correctness corpus:** a fixed **≥200-item** set per `L` (250 preferred), balanced across
   common words, inflections, phrases, heteronyms, proper names/loans, and abbreviations. At least
   two independent native raters evaluate each provider/voice/accent candidate; **≥95% must be
   "acceptable as a learning reference,"** with no known wrong-locale result. Heteronyms are
   judged with sense context. (Human-graded; not automatable.)
5. **Latency:** cached playback start <150ms p95; first cloud generation <3s p50 / <8s p95.
6. **Catalog cache hit:** 100% for catalog words after prefetch warmup.
7. **Offline:** a downloaded collection plays fully in airplane mode; checksum-verified.
8. **Cost:** measured provider cost per active user per month ≤ your set ceiling (requires dedup +
   no-on-insert).
9. **Account isolation:** private asset metadata, files, and reusable URLs from user A are absent
   after sign-out and inaccessible to user B. Public catalog assets remain safe to reuse.
10. **Backend regression:** authenticated offline/reconnect and two-device recovery tests for the
    existing Supabase/PowerSync foundation pass before pronunciation relies on synchronized state.

---

## 9. Minimal staged rollout

- **Phase 0 (multilingual identity, no pronunciation):** choose sense-aware uniqueness versus soft
  dedup; fix guest and Supabase constraints; pass language codes through create/edit; update
  normalization, guest import, cutover/conflict keys, uploader expectations, and tests.
  **Implemented locally on 2026-07-20 using soft dedup.**
- **Phase 1 (live device pronunciation):** pronounce `term` using its exact configured source
  BCP-47 locale; enumerate voices on every attempt, select an exact locale match, prefer an
  enhanced exact voice, label playback `≈ Device voice`, and show honest missing-voice guidance.
  Android can open the system voice installer; iOS provides the matching Settings path and silent
  mode reminder. Works in guest and signed-in modes without depending on PowerSync.
  **Implemented locally on 2026-07-20.** Expo Speech does not expose Android's network-required
  voice flag, so Phase 1 deliberately makes no offline-voice claim; a custom native enumeration
  bridge remains deferred.
- **Phase 2 (local file cache):** add content-addressed cache files and public/guest/account
  filesystem namespaces; add native synth-to-file only if its real-device output passes quality
  and format tests. Wire cache clearing into all account transitions.
  **Implemented locally on 2026-07-20:** SHA-256 identities preserve exact trimmed text and include
  locale, exact voice identifier, platform, rate, pitch, format, and synthesis version. Cache
  writes use per-file temporary paths and atomic moves, duplicate misses share one in-flight task,
  stale temporary files are removed, and oldest files are evicted above 64 MiB. Guest files
  persist; account-private directories are cleared before manual sign-out and after automatic
  account transitions. The `public` namespace is reserved but unused. Generation or cached-file
  playback failure deletes invalid output and falls back once to Phase 1 live exact-voice speech.
  Web intentionally remains on Phase 1 browser/device speech. No Supabase, PowerSync, Storage,
  database, download UI, or cloud-pronunciation changes are part of this phase.
- **Phase 3A (provider bakeoff):** screen pinned Google and Azure voices with blinded native
  review before selecting a provider. **Tooling implemented locally on 2026-07-20:** 210 candidate
  items across seven locales produce 840 planned samples at a conservative estimated $0.28296.
  Paid generation requires a native or explicitly provisional screening review, explicit
  execution, credentials, and a run cap no greater than $20. On 2026-07-21, `en-US`, `en-GB`, and
  `sk-SK` were native-approved; best-available non-native reviews for the other four locales were
  recorded as provisional. Google generated 180 `en-US`/`en-GB`/`es-ES` samples, then stopped
  because its live catalog had no exact `es-MX` voice. Azure generated all 420 planned samples
  across fourteen exact-locale voices; file and blinding audits pass. A loopback-only blinded
  listening page now supports isolated reviewer IDs, locale progress, immediate atomic resume,
  keyboard rating, and per-reviewer export without loading the private answer key. One native
  English/Slovak reviewer rated 180 samples: both English voices were 30/30 per locale and both
  Slovak voices were 29/30, rejecting only the same syllabic-consonant phrase. `en-US-AvaNeural`,
  `en-GB-RyanNeural`, and `sk-SK-ViktoriaNeural` are single-reviewer provisional engineering
  defaults, using lower observed latency only to break tied ratings. The two-rater production gate
  remains pending and no voice/provider has passed it.
- **[DEPLOYED TO DEVELOPMENT] Phase 3B/3D (authenticated public-catalog neural preview):** the backend and
  client were implemented as two separately approved steps. The client adds a feature-flagged,
  signed-in, exact-catalog `en-US`/`en-GB` neural preview beside device speech, with verified
  public-MP3 offline replay and no automatic fallback. The 8,300-entry allowlist, budgeted function,
  immutable `pron-public` Storage, and server-owned metadata are deployed to development. The
  bounded Phase 3D backfill produced and verified all 16,600 English assets with zero pending or
  failed rows. The provisional Slovak voice remains disabled until an approved public Slovak input
  source exists.
- **[PHASE 4A DEPLOYED] Phase 4 (explicit offline downloads):** a deterministic, immutable public
  index and two locale shards now expose the 16,600 ready English asset identities, hashes, and
  sizes without per-word Edge Function calls. Phase 4B still needs the durable collection/level
  download, progress, cancellation, and eviction UX. Evaluate
  PowerSync Attachments against a small custom download cache; adopt it only if its alpha status
  and automatic watch/download model fit the requirement.
- **Phase 5 (private cloud, opt-in):** cloud for user-created words behind explicit consent,
  per-user namespace, DPA/privacy disclosure, retention policy, and account-isolation tests.
- **Deferred indefinitely (cut from scope now):** IPA/SSML override UI, wrong-pronunciation
  reporting+regeneration, self-hosted Piper, licensed human recordings, teacher/user recordings.
  Keep only the *data-model hooks* (senseId, override field, provider/model in key), not the
  features.

### Phase 0 local verification

- TypeScript, Expo lint, all 38 Jest suites (143 tests), local Supabase schema lint, all 57 pgTAP
  checks, and an Android/iOS/web Expo export pass.
- Expo Doctor remains at the pre-existing 19/21 result: the PowerSync CLI dependency tree contains
  a second React copy, and React Native Directory lacks complete metadata for Quick SQLite and the
  local translation module.
- PowerSync Cloud validation was not rerun because the CLI is not authenticated in this
  environment. No PowerSync deployment, remote Supabase migration, EAS build, or cloud build was
  performed.

### Phase 1 local verification

- TypeScript, Expo lint, all 40 Jest suites (160 tests), Android/iOS/web Expo export, and the local
  Android debug build pass. The Android build confirms that Expo Speech and Expo Intent Launcher
  autolink successfully.
- Expo Doctor remains at the pre-existing 19/21 result: the PowerSync CLI dependency tree contains
  a second React copy, and React Native Directory lacks complete metadata for Quick SQLite and the
  local translation module. Neither finding was introduced by pronunciation.
- Measured web design QA passes at 320 px and 390 px mobile widths: the compact control meets the
  44 px target floor, the full control is 55 px high, and the learning card and word-detail screen
  have no control clipping, text overflow, or horizontal page overflow.
- Real-device voice quality, audible playback, and OS voice-installation behavior still require the
  Phase 1 device matrix. No EAS build or remote pronunciation service was used.

### Phase 2 local verification

- TypeScript, Expo lint, all 43 Jest suites (169 tests), Android/iOS/web Expo export, and the local
  Android debug build pass. The Android build confirms that `wordfold-pronunciation`, Expo Audio,
  Expo Asset, and Expo FileSystem autolink and compile.
- Expo Doctor remains at the expected 19/21 result: the PowerSync CLI dependency tree contains a
  second React copy, and React Native Directory lacks complete metadata for Quick SQLite and the
  two local native modules. Expo Doctor initially identified Expo Audio's direct `expo-asset` peer;
  adding the SDK-compatible direct dependency restored the baseline result.
- Measured web design QA passes at 320 px and 390 px mobile widths. The compact pronunciation
  control is 44 px high, the full control is 55 px high, the label does not overflow, and the page
  scroll width equals the viewport at both sizes. The visible control keeps the `≈ Device voice`
  disclosure; preparation/play/stop labels are covered by component tests.
- The rebuilt Android APK requests no microphone or foreground-service permission. Expo Audio adds
  only `MODIFY_AUDIO_SETTINGS`; existing notification and application permissions are unchanged.
- The installed machine has Command Line Tools but no full Xcode application, so CocoaPods cannot
  complete React Native's iOS dependency analysis and a local iOS compile is not possible here.
  The Swift bridge therefore still requires an Xcode build and real-device CAF generation/playback
  before Phase 2 is release-ready.
- Real-device checks remain mandatory for audible output, exact locale behavior after voice changes,
  Android engine output format, iOS CAF output, cache-hit playback, airplane-mode replay, and voice
  quality. No EAS build or remote pronunciation service was used.

### Phase 3A local verification

- Corpus/config validation passes with exactly 30 items for each of seven locales, two configured
  candidate identifiers per provider/locale, 210 total items, and 840 planned audio samples. Live
  catalog verification subsequently rejected Google's configured `es-MX` identifiers.
- The revised conservative plan contains 9,432 billed characters and estimates $0.28296 for the complete
  Google/Azure screening run. This is a planning estimate, not a provider quote.
- TypeScript, Expo lint, and all 45 Jest suites (182 tests) pass. The prior Android/iOS/web Expo
  export remains the latest export verification because this metadata/CLI-only change does not
  alter application bundles.
- Expo Doctor remains at the known 19/21 baseline: the PowerSync CLI dependency tree includes a
  second React version, and React Native Directory lacks complete metadata for Quick SQLite and
  the two local native modules. Phase 3A introduced neither finding.
- Safety tests confirm that generation cannot start without `--execute`, cannot exceed the $20
  ceiling, rejects falsely qualified provisional metadata, and remains blocked while any corpus
  screening review is pending. Scoring tests enforce two independent raters and the
  95%/zero-wrong-locale gates. Review-server integration tests cover blinded metadata, allowlisted
  byte-range audio, traversal rejection, reviewer isolation, atomic upserts, export, and artifact
  path confinement.
- The first Google screening attempt generated 180 checksummed audio files across `en-US`,
  `en-GB`, and `es-ES`, then failed closed on the first `es-MX` request because the pinned exact
  voice was absent from Google's live catalog. The Azure S0 run then generated 420/420 unique
  samples with zero failures: every manifest hash and byte count matches, all fourteen voices have
  30 samples, and `ffprobe` identifies every file as mono 24 kHz MP3. Its blinded package contains
  420 unique opaque files and IDs, exposes no provider/model/voice identity, and keeps the complete
  private mapping outside reviewer output. The local review server is confined to `.artifacts`,
  binds to `127.0.0.1`, allowlists audio by opaque manifest ID, isolates browser reads/exports by
  reviewer ID, and writes one combined ratings file atomically. No Supabase deployment, database
  migration, Storage change, PowerSync change, or EAS build occurred.
- Measured review-page QA at 375 px, 768 px, and 1280 px finds no horizontal overflow, clipped text,
  or undersized visible controls. Mobile rating controls are 76 px high; tablet progress stacks
  above the sample; desktop uses a 24 px column gap and equal 104 px rating cards. Real MP3 playback
  reached ready state with no browser errors, keyboard navigation passed, and the checked text/color
  pairs meet WCAG AA contrast. Automated axe-core analysis was not run.
- The canonical ratings file contains 180 unique ratings by `jozef`: 178 acceptable, two
  unacceptable, and zero wrong-locale. The two unacceptable results are the same Slovak phrase for
  both candidates. The unchanged scorer reports zero fully rated samples and `canRecommend: false`.
  The approved single-reviewer decision and exact provisional selections are recorded separately;
  no cloud resource or application behavior changed as a result.

---

## 10. Accepted risks & product claims to avoid

**Accepted risks (document them):** device-voice quality and network requirements vary by OS/OEM
and are partly outside your control; heteronyms without a sense may be wrong; abbreviations/proper
names may be mispronounced; on reinstall the local audio cache is lost. Cloud assets can
re-download from Storage; device-generated cache must be regenerated. Both caches are disposable.

**Claims the product must NOT make:**
- ❌ "Native/human/perfect pronunciation" — it's synthetic (unless you license human audio per B9).
- ❌ "Correct pronunciation" — say **"reference pronunciation"** / **"neural TTS voice"** /
  **"≈ approximate device voice."**
- ❌ "Works offline for any language" — only for languages with an installed voice or downloaded
  audio.
- ❌ "Teaches correct accent" — it's a reference aid, not a pronunciation coach.
- ❌ Any implication that private words stay on-device while running "Best Available" cloud mode —
  be explicit about what leaves the device.

---

## 11. Questions that must be decided before implementation

1. **Resolved for Phase 0:** initial languages/locales are English (`en-US`, `en-GB`), Spanish
   (`es-ES`, `es-MX`), German (`de-DE`), Greek (`el-GR`), and Slovak (`sk-SK`). Their actual voice
   quality and availability still require the Phase 1 device matrix.
2. **Resolved:** soft dedup. Manual create/edit warns for the same source language + normalized
   term and permits another sense; bulk/catalog flows keep their explicit English-only filtering.
3. **Resolved for v1:** pronounce the learning-language `term` using its exact source locale.
   Target pronunciation locale is stored for forward compatibility; translation playback remains
   outside v1.
4. **Can signed-out users use cloud catalog audio?** Recommend device playback for everyone and
   authenticated cloud generation initially; a public catalog delivery path can be added after
   abuse/cost implications are specified.
5. **Provisionally resolved for engineering only:** Azure `en-US-AvaNeural`, `en-GB-RyanNeural`,
   and `sk-SK-ViktoriaNeural`. These single-reviewer defaults do not pass the production bakeoff;
   the four other locales remain unselected.
6. **Is catalog text (WordNet definitions/examples, CEFR terms) licensed to be sent to a
   third-party TTS?** Terms are likely fine; sending definitions/examples may not be — check
   `assets/licenses/CONTENT_SOURCES.md`.
7. **Cloud for private words: default-on or opt-in?** (R4) Recommend opt-in.
8. **Monthly cost ceiling and who owns the budget alarm?** No cloud TTS until this exists (R1/R2).
9. **Legal:** privacy-policy update + provider DPA signed before any user text leaves the device.
10. **Resolved as an explicit limitation:** engineering may proceed with one native English/Slovak
    reviewer, but criterion #4 remains unmet and the product cannot claim reference quality or
    production approval.
11. **What pronunciation state truly needs cross-device sync?** Recommend none for the first cloud
    release. Add PowerSync request/link state only for an approved offline or multi-device use case.

---

## Appendix: Provider comparison

| Option | Quality (ref.) | Offline | Marginal cost | Caching allowed | Needs backend | Needs native module | Key gotcha |
|---|---|---|---|---|---|---|---|
| **Device system TTS (expo-speech)** | Low–Med, device-dependent | ⚠️ voice-dependent | $0 app cost | N/A (ephemeral) | ❌ | ❌ | **[FACT]** playback only; no SSML/IPA; Expo does not expose Android's network-required flag |
| **Native synth-to-file** (Android `synthesizeToFile` / iOS `AVSpeechSynthesizer.write`) | Low–Med, device-dependent | ⚠️ voice-dependent | $0 app cost | ⚠️ verify platform/engine terms | ❌ | ✅ | Format handling; voice availability/network requirement varies |
| **Amazon Polly** | High (neural) | ❌ (gen); ✅ after cache | $$ per char | ✅ **[FACT]** explicit, no restrictions | ✅ (creds server-side) | ❌ | Input rights are yours to secure |
| **Google Cloud TTS** | High (neural/Studio) | ❌ / ✅ cached | $$ per char | ⚠️ generated files, ToS-bound | ✅ | ❌ | Verify current output-use and caching terms before launch |
| **Azure Speech** | High (neural) | ❌ / ✅ cached | $$ per char | ✅ paid tier only **[FACT]** | ✅ | ❌ | **Free tier = no output-use rights (B8)**; retention/security conditions |
| **Licensed human recordings** | Highest (native) | ✅ if cached-permitted | License fee | ⚠️ per-license **[INFER]** | ✅ | ❌ | Redistribution/caching usually restricted (B9); not a drop-in |
| **Self-hosted Piper** | Med (varies by lang) | server-side | infra only | ✅ | ✅ (you run it) | ❌ | Ops burden; uneven language coverage; defer |

---

## Sources (platform/provider facts)

- [Expo Speech (v56)](https://docs.expo.dev/versions/v56.0.0/sdk/speech/) — playback-only, no synth-to-file, no SSML/IPA
- [Expo Intent Launcher (v56)](https://docs.expo.dev/versions/v56.0.0/sdk/intent-launcher/) — Android system activity launch
- [Amazon Polly FAQs](https://aws.amazon.com/polly/faqs/) — caching/storage explicitly permitted
- [Google Cloud Text-to-Speech basics](https://docs.cloud.google.com/text-to-speech/docs/basics) — generated audio files and applicable Google Cloud terms
- [Azure TTS data/privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security) and [Microsoft Product Terms](https://www.microsoft.com/licensing/terms/en-US/productoffering/MicrosoftAzureServices/MCA) — data handling and paid-tier prebuilt-voice output rights
- [PowerSync Attachments](https://docs.powersync.com/client-sdks/advanced/attachments) — metadata-synced, byte queue, immutable files
- [Android `TextToSpeech`](https://developer.android.com/reference/android/speech/tts/TextToSpeech) and [Android `Voice`](https://developer.android.com/reference/android/speech/tts/Voice) / [iOS `AVSpeechSynthesizer`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer) — synth-to-file and Android network-required voice capabilities
