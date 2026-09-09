---
id: "implement-spanish-sense-inventory-validation-and-coverage-reports"
title: "Implement Spanish sense inventory validation and coverage reports"
status: "done"
priority: "high"
assignee: "picker_implementation"
branch: ""
skills: []
specs: ["spanish-complete-catalog-batch-plan"]
depends_on: []
blocks: []
blocked_by: []
relates_to: []
created: "2026-09-05T15:11:03.155Z"
updated: "2026-09-05T15:51:14.365Z"
verified: "2026-09-05T15:45:13.601Z"
verified_sha: "105b32ae17bf826deba27f0ecb5ff9766f6fc826"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Implement the approved inventory implementation's validator and read-only coverage
report, following docs/SPANISH_INVENTORY_BATCH_CONTRACT.md. Own scripts/spanish-
inventory-v1.mjs and src/features/content/spanish-inventory-v1.test.js only, plus
package scripts if needed. Do not modify learner assets, runtime, shared UI or
other worker batch files. No production compiler or artificial approval.

## Acceptance Criteria

- [x] Validate individual batch schema, references, baseline/planned IDs and counts.
- [x] Generate read-only global missing-cell, baseline/next coverage and collision reports.
- [x] Fail closed for purported frozen inventories with missing or unresolved coverage.
- [x] Red/green tests cover malformed inputs, nonempty notes, exact IDs, duplicates and incomplete reports.
- [x] Preserve existing scripts and current500+185assets; no runtime imports or remote writes.

## Verify

```sh
pnpm exec jest --runInBand src/features/content/spanish-inventory-v1.test.js
git diff --check
```

## Evidence

- [progress] 2026-09-05T15:16:08.072Z by jozefmajzel: Shared batch contract and INV-001 through INV-007 scenario matrix published; two exclusive-file authoring agents running alongside validator worker. No current learner asset mutations.

## Blocker

Historical interruption: worker stopped by account Codex usage limit. Resumed
successfully on the owner's resume request; this blocker is resolved for this task.

## Controller verification

Reviewed full script and requested fixes for fabricated readiness, silent retained
entry relevels and exclusion-only coverage. All fixed with regression tests.
Full suite initially hit sandbox loopback EPERM in 10 existing local-server tests;
rerun with loopback permission passed all 98 suites / 590 tests. TypeScript and lint
passed. A manual forged-ready report was rejected. No learner/runtime imports or
writes were introduced; inventory reports remain explicitly proposal-only.

- [progress] 2026-09-05T15:45:10.125Z by picker_implementation: Implemented read-only validate/report/freeze-check CLI with exact IDs, required fields, 48-cell coverage, collisions/relevels and explicit proposal-only freeze blockers. TDD: initial missing-module red; strengthened rejection prefix; 3 self-review edge-case reds fixed. 56 focused tests pass, scoped ESLint and diff check pass. Learner baseline 685, planned138, pilots6 remain read-only. No runtime/catalog writes or approval fabrication.

### verify 2026-09-05T15:45:13.601Z @ 105b32ae — pass

- `pnpm exec jest --runInBand src/features/content/spanish-inventory-v1.test.js` exit=0
- `git diff --check` exit=0
