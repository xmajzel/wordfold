---
id: "apply-approved-spanish-a1-editorial-corrections"
title: "Apply approved Spanish A1 editorial corrections"
status: "done"
priority: "high"
assignee: "editorial-corrections"
branch: ""
skills: []
specs: ["spanish-a1-licensed-semantic-review-references", "spanish-a1-approved-review-corrections"]
depends_on: []
blocks: []
blocked_by: []
relates_to: ["spanish-a1-approved-review-corrections"]
created: "2026-09-05T12:00:00.000Z"
updated: "2026-09-05T12:19:43.463Z"
verified: "2026-09-05T12:19:43.462Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Apply both user-approved AI editorial reports to the draft 500-entry catalog. Reconcile overlapping suggested wording, hints, sense consistency, and concrete forms/gender corrections. Preserve 500 identities/category quotas and draft status. Record every report finding with before/after evidence and disposition in a committed editorial correction ledger; explicitly document broader CEFR/coverage questions without inventing certification or unapproved dataset expansion. Own only a1-candidates.json, a new a1-editorial-corrections.json ledger, and a focused editorial regression test. Do not touch pipeline, source manifest/evidence, reviewer packages, docs, or UI.

## Acceptance Criteria

- [x] Approved scoped changes implemented with relevant regression evidence: 94 report dispositions, 133 corrected entries and 4 focused regression tests passed.
- [x] Original reports and all existing human review work preserved; no reviewer package was changed by this task.

## Verify

```sh
node --check src/features/content/spanish-a1-editorial-corrections.test.js
git diff --check
```

## Evidence

- [progress] 2026-09-05T12:13:14.459Z by editorial-corrections: Applied 92 of 94 entry findings; retained two optional hints with rationale. Ledger records 133 changed entries and all finding dispositions; forms added for 66 entries, three nominal MWEs corrected to NOUN with stable identities. Focused regression verification in progress.

### verify 2026-09-05T12:13:35.001Z @ c4aed38c — pass

- `node --check src/features/content/spanish-a1-editorial-corrections.test.js` exit=0
- `git diff --check` exit=0

### verify 2026-09-05T12:14:06.536Z @ c4aed38c — pass

- `node --check src/features/content/spanish-a1-editorial-corrections.test.js` exit=0
- `git diff --check` exit=0

### verify 2026-09-05T12:19:43.462Z @ c4aed38c — pass

- `node --check src/features/content/spanish-a1-editorial-corrections.test.js` exit=0
- `git diff --check` exit=0
