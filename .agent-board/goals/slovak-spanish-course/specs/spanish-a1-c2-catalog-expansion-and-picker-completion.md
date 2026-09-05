---
id: "spanish-a1-c2-catalog-expansion-and-picker-completion"
title: "Spanish A1-C2 catalog expansion and picker completion"
status: "approved"
category: "feature"
created: "2026-09-05T00:00:00.000Z"
updated: "2026-09-05T00:00:00.000Z"
---

## Request and current evidence

The owner confirmed the 500-word local A1 preview works and requested all levels,
all words, independent Slovak/Spanish AI reviews, and implementation of the linked
`spanish-course-picker-and-gated-catalog-states` wireframe.

The repository currently has 500 A1 candidate entries and six separate prototype
entries (one per level). Complete A2-C2 datasets do not exist. "All words" must mean
a bounded learning inventory, not all Spanish dictionary headwords. The existing
approved course spec requires evidence-driven Spanish counts rather than copying
the English catalog's distribution.

The wireframe is `reviewed` and its integration task is `done`; the implementation
is functional but not a complete translation of the reviewed design. Settings
currently changes courses immediately instead of staging selection behind a
confirmation button; it lacks the mockup's explicit no-data-loss reassurance and
catalog availability summary. Course cards use generic language icons rather than
the artboards' flags. The original unavailable-catalog artboard also predates the
working development-only 500-word A1 preview.

## Proposed scope

### Current independent AI review results

Both requested agents completed all 506 existing records (500 A1 candidates plus
six prototypes) independently. Reports live under
`.artifacts/spanish-all-level-review-2026-09-05/{slovak,spanish}/` with assessment,
findings and per-entry coverage JSON. Both bind the same exact candidate file hash
`a23799039cb1eb6d89646e666e4d12aac1eacf7e1d5d725c59483070ab4beb5d`
and prototype file hash
`163be6d924444b040f016e49b78ae09c546643e9279a6b948401aadfaad23f0e`.

- Slovak: zero mandatory corrections, 18 optional refinements, 488 records with no
  actionable issue identified.
- Spanish: four required text/form corrections (`continente`, the usual feminine
  plural of `arte`, `exámenes`, `orígenes`), 14 refinements, 488 records with no new
  text issue identified. These are proposed corrections, not applied changes.
- Neither pass validates all level assignments or audio. The Spanish pass verifies
  targeted PCIC column placements and cautions that contextual A2 occurrences do
  not justify automatic releveling of every use of the same headword.

First implementation work should reconcile and apply the accepted required fixes
with audit history, then resolve refinements against selected senses before freezing
the expanded inventory. No existing native reviewer decisions are replaced.

### 1. Define and author an original A1-C2 learning catalog

- Define the level-by-level inventory and coverage matrix first, using PCIC as the
  acknowledged framework. Every proposed sense needs its own level rationale or
  explicit uncertainty; a category number is not level-placement evidence.
- Cover foundational verbs, numbers, colors, time and practical functions alongside
  the existing topical nouns/adjectives. Advanced levels need meaningful register,
  abstraction, phrase and sense progression, not arbitrary uncommon-word quotas.
- Record proposed counts after inventory selection and document inclusion,
  exclusions, overlap and alternative senses. Do not silently promote the existing
  six prototype words into a completed six-level catalog.
- Extend the current A1-only authoring/validation/review tools to a level-aware
  corpus, preserving current A1 identities and content history. Author original
  Spanish definitions/examples and Slovak hints in bounded batches against the
  agreed inventory. PCIC learner-facing text must not be bulk reproduced.
- Review every entry independently from Spanish and Slovak perspectives. Preserve
  immutable input hashes, per-entry coverage, findings, corrections and reruns.
  AI reports are AI reports; they must not fill named native-reviewer attestations.
- Make validated batches available through the development preview. A separate
  explicit release decision remains necessary for production exposure; do not
  misrepresent level coverage or native/audio validation.

### 2. Finish the reviewed course-picker design

- Match the two onboarding course states using existing theme tokens and accessible
  radio cards, with course identity graphics, selected styling and reassurance that
  neither library nor progress is removed.
- In Settings, selecting a radio updates a local pending selection. An explicit
  `Use Spanish course` / `Use English course` button applies the switch. Disable
  duplicate submissions; on failure retain the real active course and show an error.
  Leaving Settings without confirmation must not switch courses.
- Show actual catalog availability from application data: English available,
  Spanish development preview with level/count, or unavailable catalog. Do not
  hardcode a claim that all A1-C2 levels are available.
- Keep manual add/import in unavailable states and direct preview users to available
  levels. Update the wireframe with preview and partial/full-catalog states before
  implementing those additions. Preserve existing tabs and unrelated Settings.

## Likely modules / data changes

Content: `assets/catalog/spanish/`, `scripts/prepare-spanish-a1-sources.mjs`,
`scripts/spanish-a1-pipeline.mjs`, `scripts/spanish-a1-review*`, the course catalog
adapter, preview configuration, editorial/source docs and their tests. Introduce
an explicit per-level manifest and level-aware review identity; retain old A1
packages for audit rather than overwriting completed work.

UI: the linked wireframe, `src/components/course-selector.tsx`, onboarding,
Settings, Library and associated tests. No word-table or account API migration is
expected. Existing library storage, global word capacity and course-scoped progress
semantics remain unchanged.

## Outside scope

- Automatically adding the entire catalog to the user's personal learning queue.
- Spanish neural/offline audio generation, paid backfills, remote deployments or EAS
  cloud builds; these retain their existing separate approval requirements.
- Full Slovak UI translation, new exercise types, or changing English content.
- Treating a finite PCIC-aligned catalog as every Spanish word or an official
  Cervantes-certified vocabulary list.

## Acceptance and verification

- An agreed inventory accounts for all six levels and every shipped entry; no empty
  level is labeled complete. Per-entry evidence and two AI coverage records exist.
- Original definitions/examples/hints, stable sense IDs, POS/gender/forms,
  normalization, provenance/license notices and no cross-course collisions validate.
- Reviews identify AI authors truthfully and preserve any real human work.
- Switching requires confirmation, survives failures without data loss, and keeps
  course words/preferences/progress distinct. Availability copy agrees with counts
  in development and production modes.
- Add/search/study/hint/device-locale paths pass for each available level; English
  catalog and recommendation regressions pass. No English recommendation mappings
  are presented as Spanish topic coverage.
- Run focused and full Jest, TypeScript, lint, Expo Doctor and local export.
  Measure implemented UI at native-sized and desktop widths, check accessible
  labels/targets and large-text/reduced-motion behavior. Native audio remains a
  device QA requirement, not something content review can establish.

## Approval boundary

The owner approved this implementation scope on 2026-09-05. New content is available
for local preview after validation and truthful AI review; production release remains
a separate decision. This approval does not fabricate native-review attestations.

## Behavior contract

- UC-001 / F01 / staged-course-switch: Settings stages either course; confirm applies
  once, leaving cancels, failure preserves active state. Unit/integration plus live
  browser flow; stable IDs `course-selector`, `course-option-en-sk`,
  `course-option-es-sk`, `course-switch-confirm`.
- UC-002 / F02 / honest-catalog-status: guest/signed-in, preview enabled/disabled,
  empty/partial/multiple-level catalog. Counts derive from catalog; no automatic
  personal-word imports. Test catalog adapter plus Library/Settings surfaces.
- UC-003 / F03 / independent-level-review: each batch is bound to level/entry/content
  hashes; missing or stale coverage must not count as reviewed. AI source identities
  are explicit, and named human decisions stay untouched.
- UC-004 / F04 / english-regression: existing words, counts, recommendation mappings,
  pronunciation defaults and course preferences remain unchanged; full Jest gate.
- UC-005 / F05 / spanish-level-learning: search/add/study/hint lookup keeps stable
  es-sk identity and es-ES device locale for every available level.
