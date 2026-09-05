---
id: "reconcile-the-second-spanish-and-slovak-editorial-review-findings"
title: "Reconcile the second Spanish and Slovak editorial review findings"
status: "done"
priority: "high"
assignee: "second_editorial_fixes"
branch: ""
skills: []
specs: ["spanish-a1-c2-catalog-expansion-and-picker-completion"]
depends_on: []
blocks: []
blocked_by: []
relates_to: []
created: "2026-09-05T12:52:28.668Z"
updated: "2026-09-05T13:05:11.779Z"
verified: "2026-09-05T13:05:11.608Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Reconcile the 2026-09-05 independent AI Spanish and Slovak findings on the 500 A1 candidates and six prototypes. Apply the four required text/form fixes and deliberate refinements, retaining reversible content history and truthful review status.

## Acceptance Criteria

- [x] Resolve all 36 findings with changed fields or an explicit retention rationale.
- [x] Correct continente, arte, examen and origen, preserving stable IDs and sourceVersion.
- [x] Preserve both original and second-pass hash-bound reversible history and draft status; do not alter human review files or lexical evidence in this task (controller regenerated references and safely refreshed untouched pending packages separately).
- [x] Verify precise learner senses, hints, exceptional forms and regression coverage.

## Verify

<!-- Put one shell command per line inside a sh code block. `agent-board verify` runs these from the repo root before done. Leave empty to skip the verify gate. -->

```sh
pnpm exec jest --runInBand src/features/content/spanish-a1-editorial-corrections.test.js src/features/content/spanish-second-editorial-corrections.test.js src/features/content/spanish-a1-assets.test.js
git diff --check
```

## Evidence

- [progress] 2026-09-05T13:03:33.256Z by second_editorial_fixes: Applied all four required corrections and 26 refinements; six retained with rationale. Added reversible second-pass ledger and preserved first ledger. Eight focused tests pass. Asset validation awaits coordinated evidence regeneration against changed content hash.

### verify 2026-09-05T13:04:47.125Z @ c4aed38c — pass

- `pnpm exec jest --runInBand src/features/content/spanish-a1-editorial-corrections.test.js src/features/content/spanish-second-editorial-corrections.test.js src/features/content/spanish-a1-assets.test.js` exit=0
- `git diff --check` exit=0

### verify 2026-09-05T13:05:11.608Z @ c4aed38c — pass

- `pnpm exec jest --runInBand src/features/content/spanish-a1-editorial-corrections.test.js src/features/content/spanish-second-editorial-corrections.test.js src/features/content/spanish-a1-assets.test.js` exit=0
- `git diff --check` exit=0
