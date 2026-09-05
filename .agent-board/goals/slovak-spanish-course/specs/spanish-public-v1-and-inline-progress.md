---
id: "spanish-public-v1-and-inline-progress"
title: "Spanish public vocabulary release and inline progress"
status: "proposed"
category: "feature"
created: "2026-09-05T00:00:00.000Z"
updated: "2026-09-05T00:00:00.000Z"
---

## Request and evidence

The owner requests readable inline progress labels, completion/review of all course
vocabulary, and public-ready Spanish without development preview labels.

`src/app/level/[level].tsx` renders ProgressStat value and label as separate AppText
children in a column; the visible 0 / Known split is intentional source layout.
Library tiles also need count-label pairs to stay together at narrow widths.

The runtime currently exposes 685 Spanish drafts only when __DEV__ and the legacy
EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED flag are true. Onboarding, Settings and Library
correctly describe that state through describeCatalogAvailability. Hiding its text
alone would neither enable Spanish in release builds nor complete the catalog.

The inventory has 185 supplemental senses, 500 retained A1 entries, 138 explicit
next selections, and additional unmapped topic/function coverage. The original
500 level rationales remain category templates. No final complete release inventory
is frozen. Neither 685 nor 823 is therefore a defensible completion target by itself.

The prior approved specification explicitly excluded production promotion. This
amendment needs approval under the repository's specify-before-implement gate.

## Proposed behavior

### Inline progress

- Render each count and label as one readable unit: 0 Known, 0 Learning, etc.
- Keep number/label pairs together. On small screens or larger text, wrap whole
  groups/use fewer columns instead of truncating labels or shrinking text.
- Apply the same rule to Library level tiles and the detailed level progress panel.
- Preserve counts, progress calculations, colors and accessibility descriptions.

### Complete a defined A1-C2 vocabulary release

- Freeze an explicit, versioned sense inventory with coverage objectives for all
  six levels, including the missing functions/topics and the next 138 selections.
  Derive counts after sense selection and duplicate adjudication, not arbitrary
  quotas. Audit planned senses against existing IDs before adding new entries.
- Define completion as every sense in this frozen vocabulary inventory authored,
  correctly mapped and reviewed, with every declared coverage objective accounted
  for. Do not call it every Spanish dictionary word, a complete CEFR skills course,
  or a certified Cervantes course. Unmapped/incomplete objectives cannot be relabeled
  complete merely to reach a publishing date.
- Replace the 500 generic A1 placement rationales with individual sense decisions.
  Preserve saved sense identity and document any releveling so existing words and
  progress continue to resolve; do not silently reclassify user-saved records.
- Author original Spanish definitions/examples, Slovak hints, POS, gender/forms,
  register and level rationale. Use PCIC as the acknowledged permitted framework,
  without copying bulk protected learner text.
- Run independent Spanish and Slovak AI review over every final entry, including
  changed legacy entries; resolve findings and bind final evidence to exact hashes.

### Production promotion and truthful review policy

Recommended policy for owner approval: independent AI editorial review plus the
owner's acceptance of this release process may support a production vocabulary
release, with AI authorship/review explicitly recorded in the release manifest.
This is a deliberate change to the existing human-attestation-only promotion path,
not a claim that native reviewers completed it. Real human packages and historical
gates remain preserved; no decisions or attestations are fabricated for named people.
If the owner instead requires native signoff, obtain those actual reviews before
promotion; agents cannot provide them on the named people's behalf.

- Introduce an explicit production release manifest that records the frozen
  inventory, sources/attribution, exact content and review hashes, review kinds,
  resolved findings and owner acceptance of the review policy.
- Reject stale/incomplete coverage, missing required learner fields, unresolved
  corrections, invalid provenance or inconsistent counts at release compilation.
- Load that compiled production asset in normal builds; retire the development flag
  as a dependency of Spanish course availability. Keep draft tools/assets separate.
- Remove Local preview, draft and pending-catalog messaging for this published
  catalog from onboarding, ready, Settings, Library and level pages. Keep useful
  language, level and actual-count information and PCIC attribution.
- Preserve manual imports, course isolation, existing saved words/progress, capacity
  limits and es-ES device pronunciation. No automatic whole-catalog queue import.

## Files / compatibility

UI: level/[level].tsx, (tabs)/library.tsx, catalog-availability.ts, onboarding,
onboarding-ready and Settings; related wireframe and tests.
Content: assets/catalog/spanish, inventory and review/release pipelines, source
notices and editorial policy. Runtime: course-catalog.ts, courses.ts and preview
configuration/tests. No account, server API or SQL schema migration is expected.
Any needed stable-ID alias/relevel compatibility mapping is part of this scope;
destructive rewriting of user word records is not.

## Verification and release boundary

- Update/review the small progress and production-availability wireframe states
  before UI implementation. Measure narrow/desktop widths and enlarged text.
- Tests prove inline count-label units and correct actual counts; production mode
  exposes the full frozen catalog with the preview flag absent, while unreviewed
  draft assets are not reachable through normal lookups.
- Validate every final entry, both independent reviews, complete objective mapping,
  source notices and repeatable release compilation.
- Test search/add/study/hints/voice locale for all levels, cross-course homographs,
  prior saved IDs and English regressions. Run full Jest, TypeScript, lint, Expo
  Doctor and local production export.
- Actual Spanish voice availability/quality and native large-text/screen-reader
  behavior require real device verification; report anything unverified honestly.
- This scope makes the repository's normal production builds ready. Remote app-store
  submission, hosting/OTA deployment and EAS cloud builds are separate operations
  requiring an identified destination and applicable approval. No paid neural audio
  generation, new exercise types, full Slovak UI localization or English content
  changes are included.

## Approval requested

2026-09-05 scoped approval: the owner's latest request quotes and explicitly asks
to fix the inline count-label layout. That UI subsection is approved. Inventory
planning and batch delegation are requested; this does not by itself approve the
separate proposed production review-policy amendment below.

Approve the inline layout fix, complete versioned vocabulary inventory/review work,
and production promotion policy above (truthful AI review plus owner acceptance,
not invented native-speaker signoff). No implementation changes have been made in
this proposal turn.
