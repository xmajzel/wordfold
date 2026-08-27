---
id: "slovak-native-spanish-course-research-and-implementation-specification"
title: "Slovak-native Spanish course research and implementation specification"
status: "approved"
category: "feature"
created: "2026-08-27T18:02:47.645Z"
updated: "2026-08-27T18:02:47.645Z"
---

## Context

Wordfold currently ships one implicit course: English learning terms with English
definitions/examples and Slovak hidden hints. The app already stores multilingual
words and registers Spanish locales, but the built-in CEFR catalog, discovery packs,
onboarding, preferences, import, automatic translation, progress summaries,
reminders, widgets, and neural/offline pronunciation are English-course-specific or
global.

The requested product direction is assumed to mean a Slovak-native user learning
Spanish. In the current data model that is deliberately represented as:

- `sourceLanguageCode = "es"` and `sourcePronunciationLocale = "es-ES"` (or the
  explicitly selected Spanish regional voice), because the source is the learned and
  pronounced term.
- `targetLanguageCode = "sk"` and `targetPronunciationLocale = "sk-SK"`, because the
  target is the hidden hint.
- User-facing copy may say “Slovak → Spanish”, but implementation names must use an
  unambiguous course ID such as `es-sk`.

Existing pedagogy should be preserved: the definition and example remain in the
learned language (Spanish), while the Slovak translation is the revealable hint. The
application chrome remains English unless UI localization is separately approved.

Current English catalog invariants must remain unchanged: 8,300 entries across A1–C2,
stable catalog sense IDs, English definitions/examples, reviewed Slovak hints, current
progress, and current pronunciation assets.

The central content constraint is that no identified source provides commercially
safe, complete Spanish A1–C2 vocabulary, senses, definitions, examples, and Slovak
translations as a reusable dataset. Instituto Cervantes is an authoritative
qualitative reference but no bulk-reuse license was identified. ELELex is useful
machine-readable evidence but is A1–C1 and CC BY-NC-SA. Spanish WordNet from MCR is
CC BY 3.0 and suitable for lemma/sense grounding, not CEFR grading or complete learner
content. A full catalog therefore requires either a separately licensed publisher
source or a Wordfold-owned, independently reviewed content pipeline.

## Decisions

Recommended defaults, subject to product approval before implementation:

1. Treat “Slovak → Spanish” as “learn Spanish with Slovak hints”; use internal course
   ID `es-sk`.
2. Keep Spanish definitions/examples and Slovak revealable hints. Do not localize all
   app chrome as part of this feature.
3. Use neutral, broadly understood Spanish catalog content. Launch with `es-ES` as the
   default pronunciation locale; expose `es-MX` as a separate voice/accent choice only
   after its own native-speaker quality gate. Do not create regional vocabulary forks
   in the first version.
4. Add a typed course registry and derive each word's course from its existing
   source/target language fields. Do not add `course_id` to the word schema.
5. Persist a device-local active course, defaulting existing users to `en-sk`. Keep
   each course's words and review history when switching.
6. Scope learning feed, catalog/library browsing, recommendations, level/topic/filter
   preferences, progress, reminders, and widget selection to the active course. Keep
   collections and the free 100-word capacity/paid entitlement global.
7. Make pronunciation preferences learning-language scoped. Ship exact-locale device
   TTS in the core milestone. Full current-feature parity also includes public neural,
   private neural, voice samples, and downloadable Spanish offline packs, but those
   form a later milestone because they require paid generation, backend migrations,
   storage, and native review.
8. Use reviewed, bundled Spanish → Slovak hints for catalog content. Generalize ML Kit
   translation to Spanish → Slovak only for manual words and missing hints. Do not use
   runtime machine translation as the authoritative catalog.
9. Build a separate Spanish catalog namespace and course-aware lookup facade. Never
   merge entries into the English JSON/index or reuse English `catalogSenseId` values.
10. Do not claim that device TTS is offline-capable without airplane-mode device
    verification; an installed Android voice can still require a network connection.

Approval blockers:

- Confirm the language direction and Spanish-definition/Slovak-hint pedagogy.
- Confirm whether `es-ES` alone or both `es-ES` and `es-MX` must launch.
- Confirm independent per-course progress/reminders/widgets and global capacity.
- Choose the catalog source path: commercial licensed data, or original Wordfold
  content with expert CEFR grading and native review.
- Confirm whether the first public release may ship device TTS before Spanish
  public/private neural and downloadable offline packs are complete.
- Set quantitative content acceptance thresholds and nominate Spanish and Slovak
  reviewers. Pronunciation already has a suitable gate: two independent native
  reviewers, at least 200 samples per locale, at least 95% acceptable, and zero
  wrong-locale samples.

## Expected behavior

- New and existing users can choose between the existing English course and Spanish
  with Slovak hints without losing either course's words or review history.
- Existing installations migrate silently to the English course and preserve current
  preferences and behavior.
- The active course controls onboarding summaries, Learn feed, catalog levels,
  discovery topics, import defaults, automatic translations, progress totals,
  reminders, widgets, and pronunciation choices.
- Spanish provides A1, A2, B1, B2, C1, and C2 browse surfaces, each with complete,
  stable, source-traceable entries: Spanish lemma/headword, part of speech, learner
  definition, natural example, Slovak hint, level, sense ID, and review metadata.
- Spanish level counts are evidence-driven. They do not need to equal English counts,
  and the product labels them “CEFR-aligned,” not official CEFR word lists.
- Spanish term search handles diacritics and uses Spanish normalization. Lookup keys
  are course/language-aware so cross-language homographs cannot collide.
- Adding a catalog entry creates an `es` → `sk` word with the selected Spanish locale;
  manual entry and bulk import default to that pair when the Spanish course is active.
- Device pronunciation uses an exact installed `es-ES` or `es-MX` voice and never
  silently substitutes another region/language.
- Neural pronunciation, when enabled, can only synthesize canonical Spanish catalog
  text with a matching Spanish locale. Private manual-word pronunciation retains
  sign-in, explicit consent, deletion, retention, quota, and integrity protections.
- Spanish offline packs support per-level/library downloads, pause/resume/removal,
  checksum verification, disk checks, and true airplane-mode playback.
- English catalog, recommendations, audio, offline manifests, progress, and UI remain
  behaviorally unchanged.

## Content and level strategy

Recommended production path:

1. Freeze a documented Spanish editorial policy covering lemmas, noun gender,
   adjective gender presentation, reflexive verbs, pronominal forms, inflections,
   multiword expressions, proper nouns, abbreviations, variants, and homographs.
2. Use Spanish WordNet/MCR (CC BY 3.0) for reusable lemma/sense grounding. Use only
   pinned and license-verified corpus metadata for POS/frequency evidence; do not copy
   raw corpus sentences unless their exact source license permits it.
3. Use CEFR descriptors and Instituto Cervantes only as qualitative editorial
   references unless written reuse permission is obtained. Do not scrape or bundle
   the Plan Curricular.
4. Either license an A1–C2 grading source or create original level assignments with
   documented evidence and expert review. Do not translate the English list and call
   the result Spanish CEFR.
5. Write original learner-friendly Spanish definitions and examples, then run
   linguistic/naturalness review. Generate Slovak hint candidates from committed
   evidence and independently review every shipped hint.
6. Pilot A1/A2 first to calibrate the pipeline and reviewer agreement, but retain a
   complete A1–C2 acceptance target before claiming full course parity.
7. Commit immutable source manifests, license/attribution records, checksums,
   generation metadata, review state, exclusions, and deterministic validators.

## Architecture and likely file areas

Course and persistence:

- Add a typed course registry near `src/domain/languages.ts`/`src/domain/types.ts`.
- Extend `src/data/repository.ts`, `src/providers/app-data-provider.tsx`, and their web
  equivalents with active course and course-keyed preferences/voice choice.
- Increment the local metadata schema/version only as needed for active course and
  course-keyed settings. No local, PowerSync, or Supabase word-table migration is
  required if course identity continues to derive from the language pair.
- Add a cloud preference schema only if settings must sync across devices; otherwise
  keep this device-local and document that behavior.

Catalog and content:

- Introduce a course-catalog facade around `src/data/cefr-catalog.ts` and
  `src/data/catalog.ts`.
- Add separate Spanish catalog/index/manifest/definition/example/Slovak-hint assets
  under a course-specific path, namespaced IDs, and a Spanish lexicon adapter/database.
- Generalize the catalog builders/validators in `scripts/` without weakening existing
  English invariants. Update `assets/licenses/CONTENT_SOURCES.md` and provenance docs.
- Add Spanish topic/discovery pack assets rather than reusing English NGSL mappings.

UI and behavior:

- Add course choice to onboarding plus a persistent switcher in settings/library.
- Parameterize onboarding, level screen, library, preferences, Learn, cards,
  accessibility labels, new/edit word, import, account-import conflict display,
  progress, reminders, notifications, and widgets.
- Feed only active-pair words to the existing scheduling algorithm; keep its rating
  and review math unchanged.
- Keep existing navigation tabs and purchases. Do not add a new tab, achievements,
  sharing, or analytics.

Translation:

- Replace the English-specific JavaScript wrapper with a validated pair-aware API.
- Enable `es` → `sk` in provider/UI gates. Android's native ML Kit bridge is already
  language-tag driven; add Spanish to the iOS allowlist.
- Surface model-download/offline/failure states. Note that ML Kit routes non-English
  pairs through English, so reviewed catalog hints remain authoritative.

Pronunciation:

- Keep the generic device path, exact-locale matching, 64 MiB cache, and fallback
  behavior; add Spanish device/real-device test coverage.
- Generalize language-scoped voice preferences, labels, samples, controls, and copy.
- Add language identity to the public pronunciation catalog and expand client, Edge
  Function, SQL/RPC constraints, and catalog generation for approved Spanish locales.
- Add an additive Supabase migration for Spanish private/public locale constraints;
  never edit deployed migrations. Update private-processing disclosure and bump the
  consent version before allowing Spanish private synthesis.
- Generalize offline manifest/index/shards, backfill/publisher scripts, download UI,
  provider/coordinator, and onboarding readiness from two English packs to
  course/locale-specific packs.
- Paid synthesis/backfill, remote deployment, and any EAS cloud build require separate
  explicit approval. EAS builds consume the project's limited monthly quota.

## Data and API changes

- Add `CourseId`/`CourseDefinition` and capability metadata; no new word `course_id`.
- Add active-course and course-keyed preferences/voice metadata with backward parsing
  of current single-course values.
- Update catalog APIs to require a course or learned-language argument. Avoid global
  normalized-term lookup.
- Decide whether duplicate identity should include target language; the current source
  language + normalized-term key can conflate the same learned term used with two hint
  languages.
- Generalize translation input to explicit source and target language codes/locales.
- Extend pronunciation locale/voice unions and strict API responses only for approved
  Spanish voices.
- Add language/course identity to the public pronunciation catalog and namespaced
  Spanish sense IDs. Version offline manifest schemas if necessary.
- Preserve all existing public contracts unless the approved specification explicitly
  calls for an additive multilingual field or endpoint behavior.

## Edge cases

- Existing user with completed onboarding and old global preference values.
- Empty newly selected course; switching back restores the previous feed immediately.
- Same spelling across English/Spanish or same source term with different hint
  languages; catalog and duplicate checks must not cross-match incorrectly.
- Spanish diacritics, Unicode normalization, reflexive verbs, gender alternatives,
  homographs, phrases, punctuation, and region-specific vocabulary.
- `es-ES` unavailable but `es-MX` installed (and the reverse): report the exact missing
  voice, never substitute silently.
- Android voice marked installed but requiring network; iOS device in silent mode.
- Partial/offline ML Kit model download and the quality loss from English pivoting.
- Course switched while reminder/audio/catalog work is in flight.
- Reminder deep link to a word outside the active course; open the word safely without
  deleting or reclassifying it.
- Mixed-course account import conflicts and global free-cap calculations.
- Corrupt/incomplete offline Spanish pack, insufficient disk, stale manifest, resume,
  removal, and rollback to device TTS.
- Bundle/storage growth from a second catalog and one or two roughly 100+ MiB audio
  packs; actual sizes must be measured before release.

## Risks and assumptions

- Highest risk: content licensing and defensible A1–C2 grading, not code.
- High risk: Spanish and Slovak linguistic quality at scale; require named reviewers,
  calibrated rubrics, sampling plus automated invariants, and release evidence.
- High risk: neural audio storage/generation cost and additional download size.
- Medium risk: implicit global state causing cross-course mixing in feed, statistics,
  reminders, or widgets.
- Medium risk: native changes on iOS for ML Kit and real-device-only TTS behavior.
- Assumption: the requested direction is Spanish learning with Slovak hints.
- Assumption: existing app chrome remains English.
- Assumption: course settings are device-local unless cross-device settings sync is
  separately requested.

## Explicitly out of scope

- Microphone recording, speech-to-text, pronunciation scoring, IPA/phoneme display,
  or accent grading; none is a current Wordfold feature.
- Full Slovak app-interface localization.
- New lessons/exercises, grammar curriculum, achievements/streak gamification,
  sharing, analytics, or new monetization/SKUs.
- Regionalized Spanish vocabulary catalogs in the first release.
- Rewriting the scheduling algorithm, changing the current English catalog, or
  migrating existing word rows to a new course ID.
- Running paid neural backfill, deploying backend changes, or consuming an EAS cloud
  build without a separate explicit approval immediately before the action.

## Minimal acceptance criteria

1. Product/content decisions above are approved and all bundled sources have recorded,
   release-compatible licenses and attribution.
2. Existing users default to `en-sk` with no data, progress, preference, catalog, audio,
   or purchase regression.
3. A user can select `es-sk`, browse all six levels, add/import/manual-create Spanish
   words, study/rate them, search them, reveal Slovak hints, and switch courses without
   cross-course mixing or data loss.
4. Every shipped Spanish catalog entry has a unique namespaced ID, Spanish term,
   level, POS, original reviewed definition/example, reviewed Slovak hint, provenance,
   and deterministic validation evidence.
5. Recommendations/topics, preferences, stats, reminders, and widget behavior follow
   the approved active-course semantics.
6. `es` → `sk` manual translation works on supported native platforms with clear model
   download/error states; catalog hints never depend on runtime translation.
7. Exact-locale Spanish device TTS passes Android/iOS device tests, missing-voice UX,
   cache/fallback checks, and airplane-mode claims are evidence-based.
8. Before neural parity is marked complete, approved Spanish voices pass the existing
   native-review gate; public/private APIs reject wrong-language/wrong-locale requests;
   consent is renewed; offline packs pass checksum, resume, disk, removal, and
   airplane-mode tests for every supported level/locale.
9. Jest, TypeScript, lint, Expo Doctor, and local Expo export pass. Native changes pass
   local Android/iOS builds and real-device tests. EAS is optional and separately
   approved.

## Verification plan

- Unit/integration: course registry and migration, course-keyed repositories/providers,
  catalog invariants/search/collisions, import/translation, active-course scheduling,
  stats, reminders, widgets, capacity, account import, all pronunciation layers, and
  English regression suites.
- Content: six-level presence; unique namespaced IDs; required-field completeness;
  source/license manifest; distribution/anomaly reports; duplicate/homograph policies;
  Spanish and Slovak review sign-off.
- Native/manual: Android and iOS exact Spanish voice selection, missing voices, silent
  mode, cached playback, corruption fallback, ML Kit model download, offline failure,
  notification deep links, widgets, and course switching.
- Release gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, Expo Doctor, local Expo
  export, local native builds where required, and real-device airplane-mode testing.

## Tasks

The board task graph linked to this specification separates content/legal decisions,
core course architecture, catalog production, app integration, and neural/offline
pronunciation so independent work can proceed after approval without weakening gates.
