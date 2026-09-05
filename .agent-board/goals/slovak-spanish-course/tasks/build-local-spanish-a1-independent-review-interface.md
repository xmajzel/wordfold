---
id: "build-local-spanish-a1-independent-review-interface"
title: "Build local Spanish A1 independent review interface"
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
created: "2026-09-04T11:30:02.221Z"
updated: "2026-09-04T11:44:56.032Z"
verified: "2026-09-04T11:44:22.479Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Implement the approved dependency-free, loopback-only reviewer interface for the
existing Spanish and Slovak A1 review packages.

## Acceptance Criteria

- [x] Server binds only to `127.0.0.1` and serves one selected `.artifacts` package.
- [x] Candidate/source/evidence/review hashes and shapes are validated before serving.
- [x] Reviewers can search, filter, navigate, decide, annotate, save, and resume.
- [x] Spanish approval enforces offered-sense or documented-exception selection.
- [x] Slovak review never exposes Spanish decisions.
- [x] Writes are atomic and reject stale/conflicting updates.
- [x] Finalization requires complete decisions and reviewer-entered attestation.
- [x] Documentation and focused regression tests are complete.

## Verify

```sh
pnpm test -- src/features/content/spanish-a1-review-server.test.js src/features/content/spanish-a1-pipeline.test.js src/features/content/spanish-a1-source-preparation.test.js src/features/content/spanish-a1-assets.test.js src/data/course-catalog.test.ts
pnpm typecheck
pnpm lint
git diff --check
```

## Evidence

- [progress] 2026-09-04T11:39:30.180Z by implement-review-ui: Implemented loopback single-package server, isolated reviewer client, atomic revision-guarded writes, finalization, documentation, and focused tests; beginning verification.

### verify 2026-09-04T11:44:22.479Z @ c4aed38c — pass

- `pnpm test -- src/features/content/spanish-a1-review-server.test.js src/features/content/spanish-a1-pipeline.test.js src/features/content/spanish-a1-source-preparation.test.js src/features/content/spanish-a1-assets.test.js src/data/course-catalog.test.ts` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0

- [progress] 2026-09-04T11:44:32.711Z by implement-review-ui: Board verify passed all four gates. Measured reviewer UI at 1280/768/375 px with no overflow, small non-checkbox tap targets, or sub-16px editable controls; contrast spot checks passed WCAG AA. No reviewer decisions or production runtime files were changed.
