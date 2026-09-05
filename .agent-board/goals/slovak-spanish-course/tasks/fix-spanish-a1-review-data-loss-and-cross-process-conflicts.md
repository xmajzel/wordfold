---
id: "fix-spanish-a1-review-data-loss-and-cross-process-conflicts"
title: "Fix Spanish A1 review data loss and cross-process conflicts"
status: "done"
priority: "high"
assignee: "implement-review-ui"
branch: ""
skills: []
specs: ["local-spanish-a1-independent-review-interface"]
depends_on: []
blocks: ["obtain-and-adjudicate-independent-spanish-a1-reviews"]
blocked_by: []
relates_to: ["local-spanish-a1-independent-review-interface"]
created: "2026-09-04T11:47:57.706Z"
updated: "2026-09-04T11:54:31.252Z"
verified: "2026-09-04T11:54:17.622Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Correct the two approved-spec violations found during independent self-review: prevent
navigation/filter/search from silently discarding an edited review draft, and prevent
two local server processes from overwriting the same review package concurrently.

## Acceptance Criteria

- [x] Leaving a dirty subject either saves it successfully or visibly blocks the
      navigation/filter action; no review input is silently discarded.
- [x] Keyboard and button navigation use the same safe behavior.
- [x] Concurrent writers across separate processes cannot both commit from one base
      revision; one receives a conflict and the first valid write remains intact.
- [x] Lock artifacts are package-specific, safely cleaned up, and do not weaken path
      containment or atomic-write behavior.
- [x] Focused regression tests cover both defects.

## Verify

```sh
pnpm test -- src/features/content/spanish-a1-review-server.test.js
pnpm typecheck
pnpm lint
git diff --check
```

## Evidence

- [progress] 2026-09-04T11:51:08.401Z by implement-review-ui: Added dirty-transition blocking across search, filters, buttons, and keyboard navigation; added canonical package-specific exclusive locks around revision-checked atomic writes and cross-process regression coverage.

### verify 2026-09-04T11:52:30.118Z @ c4aed38c — pass

- `pnpm test -- src/features/content/spanish-a1-review-server.test.js` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0

### verify 2026-09-04T11:54:17.622Z @ c4aed38c — pass

- `pnpm test -- src/features/content/spanish-a1-review-server.test.js` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0

- [progress] 2026-09-04T11:54:31.226Z by implement-review-ui: Aligned transitions with the approved autosave contract: dirty drafts save before navigation/search/filter and proceed only on success; validation/conflict errors preserve the current subject and previous filter value. Final verification passed.
