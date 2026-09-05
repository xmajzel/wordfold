---
id: "implement-level-aware-spanish-draft-batches-and-review-coverage"
title: "Implement level-aware Spanish draft batches and review coverage"
status: "done"
priority: "high"
assignee: "codex"
branch: ""
skills: []
specs: ["spanish-a1-c2-catalog-expansion-and-picker-completion"]
depends_on: []
blocks: []
blocked_by: []
relates_to: []
created: "2026-09-05T12:52:28.738Z"
updated: "2026-09-05T13:38:15.944Z"
verified: "2026-09-05T13:34:00.381Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Validate original supplemental A1-C2 draft batches and hash-bound independent AI
coverage without changing the existing A1 human-review or production-release gates.
Expose validated preview entries through existing catalog APIs and derive honest counts.

## Acceptance Criteria

- [x] Strict level-aware entry, identity, morphology, provenance and count validation.
- [x] Independent Spanish/Slovak AI coverage rejects stale, duplicate or missing entries.
- [x] Preview preserves existing A1 IDs and English behavior; production remains gated.
- [x] Availability reports actual per-level counts, without claiming curriculum completion.

## Verify

```sh
pnpm exec jest --runInBand src/features/content/spanish-expansion-pipeline.test.js src/features/content/spanish-expansion-assets.test.js src/features/content/spanish-inventory.test.js src/data/spanish-preview.test.ts src/data/course-catalog.test.ts
pnpm typecheck
git diff --check
```

## Evidence

### verify 2026-09-05T13:31:58.266Z @ c4aed38c — fail

- `pnpm exec jest --runInBand src/features/content/spanish-expansion-pipeline.test.js src/features/content/spanish-expansion-assets.test.js src/features/content/spanish-inventory.test.js src/data/spanish-preview.test.ts src/data/course-catalog.test.ts` exit=1

```
^
      20 |     expect(getCourseCatalogEntryForNormalizedTerm('es-sk', 'pie')).toBeNull();
      21 |
      22 |     const draftEntries = cefrLevels.flatMap((level) => getCourseCatalogEntries('es-sk', level, { includeDraft: true }));

      at Object.toEqual (src/data/course-catalog.test.ts:19:84)

PASS src/features/content/spanish-expansion-assets.test.js

Test Suites: 1 failed, 4 passed, 5 total
Tests:       1 failed, 36 passed, 37 total
Snapshots:   0 total
Time:        1.79 s, estimated 2 s
Ran all test suites matching /src\/features\/content\/spanish-expansion-pipeline.test.js|src\/features\/content\/spanish-expansion-assets.test.js|src\/features\/content\/spanish-inventory.test.js|src\/data\/spanish-preview.test.ts|src\/data\/course-catalog.test.ts/i.
```
- `pnpm typecheck` exit=0
- `git diff --check` exit=0

### verify 2026-09-05T13:34:00.381Z @ c4aed38c — pass

- `pnpm exec jest --runInBand src/features/content/spanish-expansion-pipeline.test.js src/features/content/spanish-expansion-assets.test.js src/features/content/spanish-inventory.test.js src/data/spanish-preview.test.ts src/data/course-catalog.test.ts` exit=0
- `pnpm typecheck` exit=0
- `git diff --check` exit=0

- [progress] 2026-09-05T13:37:01.617Z by codex: Implemented and verified strict level-aware draft lane,185 independently AI-reviewed entries,685 totalpreview; exact source and per-entry hashes, revised16 adjective metadata, deterministic preview and preserved prior reports. Full direct96suites529tests, TypeScript/lint/export pass. Broad curriculum remains partial; docs/SPANISH_EXPANSION_IMPLEMENTATION_VERIFICATION.md.
