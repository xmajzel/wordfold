# Architecture Review: Multilingual Pronunciation for Wordfold

> Honest, skeptical architecture review. Grounded in the current repo state and verified
> against official platform/provider documentation (July 2026).
>
> Claim tags: **[FACT]** = verified in code or official docs · **[INFER]** = reasoning ·
> **[REC]** = recommendation.

---

## 0. Grounding facts that reshape the whole review

A few things from the actual repo change the framing of the proposal materially:

- **[FACT] There is no backend, no auth, no user/account model, and no sync today.**
  `expo-sqlite` is the only store; Supabase/PowerSync/Storage don't exist yet. The proposal
  describes a multi-tenant cloud pipeline for an app that is currently single-device,
  single-user, offline.
- **[FACT] `words.normalized_term TEXT NOT NULL UNIQUE` is a single-column *global* unique
  constraint** (`src/data/database.ts:27`) — not scoped by collection, user, or language pair.
- **[FACT] Language codes are hardcoded as SQL string literals**, not parameters: `addWord`
  inserts `... 'en', 'sk', ...` (`src/data/repository.ts:75`), same in `src/data/prefill.ts:33`,
  and the schema defaults are `DEFAULT 'en'` / `DEFAULT 'sk'`. The
  `sourceLanguageCode`/`targetLanguageCode` fields exist on the type but are **not actually
  wired through inserts**.
- **[FACT] Two divergent `normalizeTerm` implementations exist**: runtime
  (`src/features/import/parser.ts:9`) does `trim → collapse spaces → toLocaleLowerCase('en')`
  with **no NFKC**; the build scripts do the same **with** `.normalize('NFKC')`. Both hardcode
  the `'en'` locale.
- **[FACT] A custom Expo native module already ships** (`modules/wordfold-translate`,
  Swift + Kotlin). Adding a native TTS-to-file module is well within existing capability — this
  unlocks an option the proposal underweights.
- **[FACT] expo-speech is not installed**, and its SDK 56 API is **playback-only**: no
  synthesize-to-file, no SSML, no IPA/phoneme input.

---

## 1. Overall verdict

**The pronunciation *product strategy* (cloud-neural-cached + device-fallback + device-only
mode) is sound and industry-standard. The proposed *architecture* is 12–18 months ahead of
where this codebase is, and its single most dangerous idea — silent quality fallback — directly
undermines the stated goal of a "reliable learning reference."**

Two structural problems dominate:

1. **The proposal builds Supabase + PowerSync + Edge Functions + Storage + global asset dedup +
   RLS for pronunciation, on an app with no accounts and no sync.** That is a large multi-tenant
   backend justified by an audio-caching feature. The backend should be justified by the
   *product* (accounts, cross-device sync, publisher catalog), and pronunciation should ride on
   it — not lead it.
2. **The unit of pronunciation is wrong.** The design implicitly treats "a word row" as the
   pronounceable thing. It isn't. Pronunciation is a function of *(exact original text, language,
   sense)* — and `normalized_term` is lossy in exactly the ways that destroy pronunciation
   correctness ("Polish"/"polish", "US"/"us", "read"/"read"). Keying cache off the word row or
   normalized term will produce confident wrong audio.

One-line recommendation: **Ship device-TTS-only first (no backend, no cost, no legal exposure),
get locale-voice detection genuinely correct, and treat cloud TTS as a later per-catalog-word
quality upgrade — not the v1 spine.**

---

## 2. Blockers (must fix before building this)

**B1 — Global `UNIQUE(normalized_term)` is incompatible with multilingual and multi-user.
[FACT/blocker]**
Same spelling collides across languages and senses: `gift` (EN present / DE poison), `chat`
(EN / FR cat), `pie`, `sensible` (EN/ES/FR, opposite meanings). Today a user literally cannot
have the English word "chat" and later the French "chat." The moment you go multilingual or
multi-tenant this constraint corrupts data or rejects valid inserts. Must become
`UNIQUE(owner_scope, source_language_code, target_language_code, normalized_term)` or be dropped
for a soft dedup. This migration is needed *regardless* of pronunciation.

**B2 — Pronunciation must not be keyed on the word row or `normalized_term`. [INFER/blocker]**
`normalizeTerm` lowercases and collapses whitespace, so it cannot distinguish heteronyms or
casing-dependent readings. The cache key must be built from the **original `term`/`translation`
text + BCP-47 locale + voice + provider + model + sense/phoneme override** — which the proposal's
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
Enumerate voices, match the exact BCP-47 tag yourself, and only call `speak` when a real matching
voice exists; otherwise report "voice not installed" with install guidance. This is the concrete
answer to "users may learn a language whose voice isn't installed." (Caveat **[INFER]**:
`getAvailableVoicesAsync` reliability on Android has historically been spotty across SDKs —
validate on real devices early.)

**B5 — Azure free tier grants no output-use rights. [FACT]** Per Microsoft's product terms, TTS
output commercial-use rights attach to the *paid* tier only. If Azure is chosen, you cannot ship
on F0. Budget for S0 from day one or don't pick Azure.

**B6 — "Licensed human dictionary recordings" is not a caching-safe drop-in. [FACT/INFER]** Human
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
  words; make cloud for *private* words explicit opt-in (which is exactly what "Device Only mode"
  should guarantee — genuinely no network, and ideally no metadata sync of the text either).
- **R5 — Divergent normalization (NFKC vs none) is a latent data-integrity bug.** Build-time
  catalog terms are NFKC-normalized; runtime user terms are not. Visually identical terms can
  mismatch on lookup/dedup and (if not careful) on cache keys. **[REC]** Unify on one
  normalization module, shared by runtime and scripts, before layering anything on top.
- **R6 — Building the multi-tenant backend before accounts exist is the over-engineering risk.**
  RLS, buckets, sync rules, signed URLs, Edge auth — all presuppose a user identity you don't
  have. High risk of building the wrong sync boundaries against imagined requirements.

---

## 4. Recommended architecture

**A phased inversion of the proposal: device-first, cloud-later, backend only when the product
(not audio) needs it.**

**Layer 0 — Pronunciation as a first-class local entity (do this now, no backend).**
- New local table `pronunciations` keyed by a **content hash** of `(text, languageCode, accent,
  provider, voice, modelVersion, format, senseId, phonemeOverride)`. Link table
  `word_pronunciations(word_id, field, pronunciation_id)` where `field ∈ {term, translation}` —
  because a learner of EN→SK wants to hear the **target** word (and optionally the source). One
  word → up to two pronounceable texts → each its own cache entry.
- Playback resolves: local file → else device voice (exact-locale, labeled) → else "unavailable."

**Layer 1 — Device synthesize-to-file via a native module (the underweighted dark horse).
[FACT+REC]**
A custom native module already ships. Add one exposing **Android
`TextToSpeech.synthesizeToFile()`** and **iOS `AVSpeechSynthesizer.write(_:toBufferCallback:)`**
(iOS 13+). This produces **cacheable, offline, zero-marginal-cost** audio using the *same* voice
the user hears live, with **no provider licensing, no privacy exposure, no backend**. Quality is
below cloud neural but is often adequate as a "reference," and — critically — it's honest: what
they cache is what their device says. This can be the entire v1 pronunciation feature.

**Layer 2 — Cloud neural TTS as a quality upgrade for *public catalog words only* (later).**
When accounts+sync exist for the product, add Storage + an Edge Function that generates
cloud-neural audio **for catalog/CEFR/publisher terms** (public, shared, deduplicated). Private
user words stay on Layer 1 (device) unless the user opts into cloud. This confines all
licensing/privacy/cost exposure to text you already control and license.

**Provider for Layer 2: Amazon Polly or Google Cloud TTS**, not Azure (B5). **[FACT]** Polly's
terms are the most caching-friendly ("cache and replay at no additional cost, no restrictions on
storing"). Google grants output ownership with caching permitted under GCP ToS (may not use
output to train competing TTS). Verify the *current* contract before launch — these terms drift.

**Modes, redefined for honesty:**
- **Device Only** → Layers 0+1. Truly offline. Reports missing voices. Default for
  privacy-sensitive users and private words.
- **Best Available** → adds Layer 2 for catalog words; device-synth audio is the labeled interim,
  **never** a silent wrong-locale substitution.

---

## 5. Suggested Postgres / Storage / PowerSync data boundaries

*(For Layer 2, once a backend exists.)*

**Postgres**
- `pronunciation_assets` (global, immutable, deduplicated): `id`, `content_hash UNIQUE`, `text`,
  `language_code`, `accent`, `provider`, `voice`, `model_version`, `format`, `duration_ms`,
  `sha256`, `storage_path`, `created_at`. **RLS: read = any authenticated; write = service role
  only** (Edge Function). No user column.
- `pronunciation_private` (per-user private audio): same shape + `user_id`. **RLS: read/write
  scoped to `user_id`.**
- `word_pronunciations` (per-user link): `user_id`, `word_id`, `field`, `asset_id` (points into
  either table via a type discriminator). RLS by `user_id`.
- **Do not sync** `storage_path` as a device path, download progress, or eviction state — those
  are device-local (matches the proposal; correct).

**Storage (two namespaces, two trust levels)**
- `pron-public/` — path = `{content_hash}.{ext}`. Truly public or long-TTL signed. Globally
  shared; one file serves all users.
- `pron-private/{user_id}/{content_hash}.{ext}` — RLS/bucket-policy scoped; short-TTL signed URLs.
- Files are immutable, content-addressed, checksummed. Regeneration = new hash, never overwrite.

**PowerSync buckets**
- A **global bucket** for `pronunciation_assets` metadata (every client subscribes; read-only).
  This is the shared-catalog case PowerSync handles well.
- A **per-user bucket** for `pronunciation_private` + `word_pronunciations`.
- **[FACT]** PowerSync syncs metadata only; bytes move through the **attachments queue**
  (immutable, UUID/hash-identified, local storage adapter, auto-retry, auto-cleanup). Use it
  rather than hand-rolling downloads.

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
            └─ BestAvailable ─▶ MatchExactVoice(locale)
                   ├─ found ─▶ Playing(labeled "≈ device") + enqueue CloudGenerate
                   └─ none  ─▶ Unavailable(labeled) + enqueue CloudGenerate (if online & allowed)
```
Invariant: **no state ever plays a non-matching-locale voice.** Cloud arrival upgrades silently
*upward* (next tap is a cache hit); quality never silently degrades mid-promise.

**Generation**
```
Requested
 └─▶ ComputeContentHash
 └─▶ DedupLookup(assets: public if catalog-text else private)
       ├─ exists ─▶ LinkExisting ─▶ Ready
       └─ absent ─▶ Enqueue
            └─ GateChecks(online? wifi-if-required? under budget? length ok? not rate-limited?)
                 ├─ fail ─▶ Pending(reason) [word still fully usable]
                 └─ pass ─▶ Generating(EdgeFn, idempotent by hash)
                       └─ Validate(duration>0, sha256, format)
                            ├─ fail ─▶ Retry(backoff, bounded) ─▶ Failed(reason, surfaced)
                            └─ pass ─▶ UploadStorage ─▶ WriteMetadata ─▶ Ready
                                        └─ AttachmentQueue.download ─▶ Verify(sha256)
                                             ─▶ atomic-rename ─▶ Cached
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
- **Senses generally**: pronunciation belongs to the *sense*, not the term. The catalog already
  has senses — exploit that.
- **Inflections/phrases**: TTS handles running text acceptably; single-word citation form may
  differ from in-phrase prosody. Decide whether you pronounce the *lemma* or the *entered form* —
  pick lemma for reference, and store the text you actually synthesized.
- **Proper names / loanwords / abbreviations** ("USA", "Dr.", "AI", "café"): neural TTS is
  inconsistent and language-dependent; abbreviations especially ("US" the country vs "us"). No
  reliable automated fix. **[REC]** Allow a per-entry **phoneme/SSML override** *field in the data
  model now* (part of the cache key) even though the UI is deferred — so overrides don't force a
  schema migration later. Cloud providers (Polly/Google) accept SSML; expo-speech does not, so
  overrides only take effect on cloud audio.
- **Regional accents** (en-US vs en-GB, es-ES vs es-MX): must be an explicit `accent` dimension in
  the key (you have it). Don't conflate with `language_code`.

**Bottom line:** the quality strategy is (1) sense-aware keys, (2) accent as a first-class
dimension, (3) a reserved override field, (4) native-speaker spot-check per locale — not raw
provider quality.

---

## 8. Measurable acceptance criteria (per supported locale)

For each launch locale `L`, gate release on:

1. **Voice detection:** exact-BCP-47 voice for `L` correctly detected as present/absent on ≥95%
   of a real-device test matrix (min 3 Android OEMs + 2 iOS versions).
2. **No wrong-locale playback:** in 100% of "voice-not-installed" test cases, app shows
   "unavailable/install" — 0 substitutions. (Hard gate.)
3. **Cloud coverage:** chosen provider offers a neural voice for `L` + each supported accent.
4. **Correctness spot-check:** a fixed 50-item set per `L` (incl. ≥10 heteronyms, ≥5 proper
   names, ≥5 abbreviations) rated by a native speaker; **≥45/50 "acceptable as reference,"**
   heteronyms judged with sense context. (Human-graded; not automatable.)
5. **Latency:** cached playback start <150ms p95; first cloud generation <3s p50 / <8s p95.
6. **Catalog cache hit:** 100% for catalog words after prefetch warmup.
7. **Offline:** a downloaded collection plays fully in airplane mode; checksum-verified.
8. **Cost:** measured provider cost per active user per month ≤ your set ceiling (requires dedup +
   no-on-insert).

---

## 9. Minimal staged rollout

- **Phase 0 (schema hygiene, no feature):** Fix B1 (scope uniqueness), fix hardcoded `'en'/'sk'`
  inserts to use the language fields, unify normalization (R5). Ships value independent of
  pronunciation.
- **Phase 1 (Device-only pronunciation, no backend):** expo-speech playback + rigorous
  exact-locale voice detection (B4) + honest "voice missing" UX. A shippable pronunciation feature
  at **zero cost and zero legal exposure.**
- **Phase 2 (Native synth-to-file cache):** add the native TTS-to-file module → offline cached
  device audio, downloadable per collection. Still no cloud, no privacy exposure.
- **Phase 3 (Cloud neural for catalog words):** only after accounts+sync exist for product
  reasons. Edge Function (cache-first, budgeted, rate-limited) + `pron-public` Storage + global
  asset dedup, for public catalog text only.
- **Phase 4 (private cloud, opt-in):** cloud for user-created words behind explicit consent;
  per-user private namespace.
- **Deferred indefinitely (cut from scope now):** IPA/SSML override UI, wrong-pronunciation
  reporting+regeneration, self-hosted Piper, licensed human recordings, teacher/user recordings.
  Keep only the *data-model hooks* (senseId, override field, provider/model in key), not the
  features.

---

## 10. Accepted risks & product claims to avoid

**Accepted risks (document them):** device-voice quality varies by OS/OEM and is out of your
control; heteronyms without a sense may be wrong; abbreviations/proper names may be mispronounced;
on reinstall the local audio cache is lost and re-downloads (Storage is source of truth, device
cache disposable — this is fine).

**Claims the product must NOT make:**
- ❌ "Native/human/perfect pronunciation" — it's synthetic (unless you license human audio per B6).
- ❌ "Correct pronunciation" — say **"reference pronunciation"** / **"neural TTS voice"** /
  **"≈ approximate device voice."**
- ❌ "Works offline for any language" — only for languages with an installed voice or downloaded
  audio.
- ❌ "Teaches correct accent" — it's a reference aid, not a pronunciation coach.
- ❌ Any implication that private words stay on-device while running "Best Available" cloud mode —
  be explicit about what leaves the device.

---

## 11. Questions that must be decided before implementation

1. **When do accounts + sync actually land?** If not soon, Phases 3–4 (the entire
   Supabase/PowerSync/Edge design) are premature. This is the pivotal question.
2. **Which languages/accents at launch?** Drives provider choice, voice-coverage checks, and the
   acceptance sets.
3. **Do you pronounce the source term, the target translation, or both?** This determines whether
   pronunciation is per-word or per-(word, field) — a schema decision you can't defer.
4. **Is catalog text (WordNet definitions/examples, CEFR terms) licensed to be sent to a
   third-party TTS?** Terms are likely fine; sending *definitions/examples* may not be — check
   `assets/licenses/CONTENT_SOURCES.md`.
5. **Cloud for private words: default-on or opt-in?** (R4) Recommend opt-in.
6. **Monthly cost ceiling and who owns the budget alarm?** No cloud TTS until this exists (R1/R2).
7. **Provider: Polly vs Google?** Decide before Edge design; caching terms and voice coverage
   differ.
8. **Legal:** privacy-policy update + provider DPA signed before any user text leaves the device.
9. **Do you commit to native-speaker QA per locale?** If not, criterion #4 can't be met and you
   can't honestly claim "reference quality."

---

## Appendix: Provider comparison

| Option | Quality (ref.) | Offline | Marginal cost | Caching allowed | Needs backend | Needs native module | Key gotcha |
|---|---|---|---|---|---|---|---|
| **Device system TTS (expo-speech)** | Low–Med, device-dependent | ✅ (installed voices) | $0 | N/A (ephemeral) | ❌ | ❌ | **[FACT]** playback only; wrong-locale substitution risk; no SSML/IPA |
| **Native synth-to-file** (Android `synthesizeToFile` / iOS `AVSpeechSynthesizer.write`) | Low–Med (device neural) | ✅ | $0 | ✅ (your file) | ❌ | ✅ (already done for translation) | Format handling (WAV/PCM); voice availability varies |
| **Amazon Polly** | High (neural) | ❌ (gen); ✅ after cache | $$ per char | ✅ **[FACT]** explicit, no restrictions | ✅ (creds server-side) | ❌ | Input rights are yours to secure |
| **Google Cloud TTS** | High (neural/Studio) | ❌ / ✅ cached | $$ per char | ✅ **[FACT]** own output, ToS-bound | ✅ | ❌ | Can't train competing TTS on output; verify current ToS |
| **Azure Speech** | High (neural) | ❌ / ✅ cached | $$ per char | ✅ paid tier only **[FACT]** | ✅ | ❌ | **Free tier = no output-use rights (B5)**; retention/security conditions |
| **Licensed human recordings** | Highest (native) | ✅ if cached-permitted | License fee | ⚠️ per-license **[INFER]** | ✅ | ❌ | Redistribution/caching usually restricted (B6); not a drop-in |
| **Self-hosted Piper** | Med (varies by lang) | server-side | infra only | ✅ | ✅ (you run it) | ❌ | Ops burden; uneven language coverage; defer |

---

## Sources (platform/provider facts)

- [Expo Speech (v56)](https://docs.expo.dev/versions/v56.0.0/sdk/speech/) — playback-only, no synth-to-file, no SSML/IPA
- [Amazon Polly FAQs](https://aws.amazon.com/polly/faqs/) — caching/storage explicitly permitted
- [Google Cloud Text-to-Speech basics](https://docs.cloud.google.com/text-to-speech/docs/basics) — output ownership/caching
- [Azure TTS data/privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security) and [caching/redistribution Q&A](https://learn.microsoft.com/en-us/answers/questions/5596131/) — paid-tier output rights, retention conditions
- [PowerSync Attachments](https://docs.powersync.com/client-sdks/advanced/attachments) — metadata-synced, byte queue, immutable files
- [Android `TextToSpeech`](https://developer.android.com/reference/android/speech/tts/TextToSpeech) / [iOS `AVSpeechSynthesizer`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer) — synth-to-file capabilities
