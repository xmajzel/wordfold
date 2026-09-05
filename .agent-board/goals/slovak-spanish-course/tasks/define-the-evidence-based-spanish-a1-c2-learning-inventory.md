---
id: "define-the-evidence-based-spanish-a1-c2-learning-inventory"
title: "Define the evidence-based Spanish A1-C2 learning inventory"
status: "in_progress"
priority: "high"
assignee: "all-level-inventory"
branch: ""
skills: []
specs: ["spanish-a1-c2-catalog-expansion-and-picker-completion"]
depends_on: []
blocks: []
blocked_by: []
relates_to: ["spanish-a1-c2-catalog-expansion-and-picker-completion"]
created: "2026-09-05T12:44:51.138Z"
updated: "2026-09-05T13:41:44.822Z"
verified: "2026-09-05T13:40:11.149Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

After approval of the linked expansion specification, define the bounded original
Spanish learning inventory across A1-C2 before authoring the missing level datasets.
Use the approved PCIC framework path without bulk copyrighted content copying.

## Acceptance Criteria

- [ ] All six levels have a proposed sense inventory, actual derived counts and a
      coverage matrix for functions/topics/foundational vocabulary/register.
- [ ] Every entry has a PCIC-referenced or independent Wordfold placement rationale,
      with uncertain/borderline placements explicitly flagged.
- [ ] Existing stable A1 IDs/history are preserved and relevel/duplicate decisions
      recorded rather than silently replacing entries.
- [ ] Spanish and Slovak AI reviews are independently recorded against input hashes.
- [ ] Original definition/example/hint authoring batches and level-aware pipeline
      tasks are specified against the agreed inventory, with objective verify gates.
- [ ] No claim of complete corpus coverage is made from six prototype examples.

## Verify

```sh
pnpm exec jest --runInBand src/features/content/spanish-inventory.test.js src/features/content/spanish-a1-assets.test.js src/data/course-catalog.test.ts src/data/spanish-preview.test.ts
node scripts/spanish-expansion-pipeline.mjs validate
git diff --check
```

Inventory validation checks exact identity coverage, derived per-level counts,
same-level objective references, explicit planned senses and honest review gaps.

## Checkpoint 2026-09-05

Implemented an original first expansion of 185 senses (A1:81, A2:24, B1:22,
B2:19, C1:20, C2:19), 25 objectives and 138 explicit next sense selections.
Machine-readable inventory and editorial method document include PCIC/CEFR
references, independent placement rationales and counts derived from selections.
Stable legacy 500 and six fixture identities remain separate and unchanged by this
task. Root coordinates two current hash-bound AI reviews and findings.

The broad inventory task remains in progress: the 138 next selections are not
authored, full topical coverage is still unmapped and the 500 legacy category
rationales need individual level adjudication. No full-course claim is made.

## Evidence

- [progress] 2026-09-05T13:19:33.603Z by all-level-inventory: Authored185 original supplemental senses with25 objectives and138 explicit next selections; inventory/docs/tests preserve partial status and legacy identity. Broad coverage remains in progress.

### verify 2026-09-05T13:19:36.376Z @ c4aed38c — fail

- `pnpm exec jest --runInBand src/features/content/spanish-inventory.test.js src/features/content/spanish-a1-assets.test.js src/data/course-catalog.test.ts src/data/spanish-preview.test.ts` exit=1

```
ual([]);
         |                                                                                    ^
      20 |     expect(getCourseCatalogEntryForNormalizedTerm('es-sk', 'pie')).toBeNull();
      21 |
      22 |     const draftEntries = cefrLevels.flatMap((level) => getCourseCatalogEntries('es-sk', level, { includeDraft: true }));

      at Object.toEqual (src/data/course-catalog.test.ts:19:84)

PASS src/features/content/spanish-inventory.test.js

Test Suites: 1 failed, 3 passed, 4 total
Tests:       1 failed, 20 passed, 21 total
Snapshots:   0 total
Time:        0.944 s, estimated 3 s
Ran all test suites matching /src\/features\/content\/spanish-inventory.test.js|src\/features\/content\/spanish-a1-assets.test.js|src\/data\/course-catalog.test.ts|src\/data\/spanish-preview.test.ts/i.
```
- `node scripts/spanish-expansion-pipeline.mjs validate` exit=0
- `git diff --check` exit=0

### verify 2026-09-05T13:20:52.224Z @ c4aed38c — fail

- `pnpm exec jest --runInBand src/features/content/spanish-inventory.test.js src/features/content/spanish-a1-assets.test.js src/data/course-catalog.test.ts src/data/spanish-preview.test.ts` exit=1

```
ual([]);
         |                                                                                    ^
      20 |     expect(getCourseCatalogEntryForNormalizedTerm('es-sk', 'pie')).toBeNull();
      21 |
      22 |     const draftEntries = cefrLevels.flatMap((level) => getCourseCatalogEntries('es-sk', level, { includeDraft: true }));

      at Object.toEqual (src/data/course-catalog.test.ts:19:84)

PASS src/features/content/spanish-inventory.test.js

Test Suites: 1 failed, 3 passed, 4 total
Tests:       1 failed, 20 passed, 21 total
Snapshots:   0 total
Time:        0.899 s, estimated 1 s
Ran all test suites matching /src\/features\/content\/spanish-inventory.test.js|src\/features\/content\/spanish-a1-assets.test.js|src\/data\/course-catalog.test.ts|src\/data\/spanish-preview.test.ts/i.
```
- `node scripts/spanish-expansion-pipeline.mjs validate` exit=0
- `git diff --check` exit=0

### verify 2026-09-05T13:40:11.149Z @ c4aed38c — pass

- `pnpm exec jest --runInBand src/features/content/spanish-inventory.test.js src/features/content/spanish-a1-assets.test.js src/data/course-catalog.test.ts src/data/spanish-preview.test.ts` exit=0
- `node scripts/spanish-expansion-pipeline.mjs validate` exit=0
- `git diff --check` exit=0

- [progress] 2026-09-05T13:41:44.822Z by codex: Verified partial checkpoint: 185 authored and independently Spanish/Slovak AI-reviewed senses, 25 objectives, 138 explicit next selections. Preview now 685 entries. Current raw/canonical hashes and correction history bound. Structural board verification passes; leave task in progress because remaining sense authoring, unmapped coverage and individual legacy level adjudication are unfinished.
