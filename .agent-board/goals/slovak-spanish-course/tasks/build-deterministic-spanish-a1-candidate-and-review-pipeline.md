---
id: "build-deterministic-spanish-a1-candidate-and-review-pipeline"
title: "Build deterministic Spanish A1 candidate and review pipeline"
status: "done"
priority: "high"
assignee: "root"
branch: ""
skills: []
specs: ["spanish-a1-500-entry-original-catalog-pilot-specification"]
depends_on: []
blocks: ["produce-and-validate-the-spanish-a1-c2-catalog-with-slovak-hints"]
blocked_by: []
relates_to: ["spanish-a1-500-entry-original-catalog-pilot-specification"]
created: "2026-08-28T16:33:28.237Z"
updated: "2026-08-28T17:08:34.297Z"
verified: "2026-08-28T17:08:34.296Z"
verified_sha: "e9990f29a404d8606d234b270e3ecf3c3cb89592"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Create the draft-only source, candidate, review, and promotion-gate pipeline defined by
the approved 500-entry A1 pilot specification. Unreviewed content must remain outside
normal runtime catalog APIs.

## Acceptance Criteria

- [x] A pinned source manifest records PCIC permission and OMW Spanish 2.0 licensing,
      attribution, release URL, checksum, and permitted transformations.
- [x] Deterministic validation enforces exactly 500 A1 candidates, exact category
      quotas, IDs, normalization, required learner content, provenance, and evidence.
- [x] Spanish and Slovak review packages bind to an immutable candidate hash and keep
      reviewer decisions independent.
- [x] Compilation refuses incomplete, same-reviewer, stale-hash, rejected, or
      unresolved-adjudication review sets.
- [x] Draft content is never exposed through production course-catalog APIs.
- [x] Focused tests cover successful validation and every promotion refusal gate.
- [x] Package scripts and documentation describe the local workflow.

## Verify

```sh
pnpm exec jest --runInBand src/features/content/spanish-a1-pipeline.test.js src/data/course-catalog.test.ts
pnpm typecheck
pnpm lint
git diff --check
```

## Evidence

- [progress] 2026-08-28T17:06:41.906Z by root: Implemented pinned source manifest, 500 original A1 draft candidates across exact 20-category quotas, 497/500 OMW exact lemma/POS evidence, immutable independent review templates, strict stale/incomplete/same-reviewer/rejected/adjudication promotion gates, and local CLI workflow. Draft remains outside runtime APIs. Full serial verification passes: 85 suites, 421 tests, TypeScript, lint, and diff check.

### verify 2026-08-28T17:06:51.080Z @ e9990f29 — pass

- `pnpm exec jest --runInBand src/features/content/spanish-a1-pipeline.test.js src/data/course-catalog.test.ts` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0

- [progress] 2026-08-28T17:08:26.524Z by root: Final self-review improved all 500 examples from template-like text to natural concrete A1 sentences, added actual-asset regression tests, documented CLI workflow, regenerated immutable OMW evidence, and confirmed compile creates no artifact while reviews are pending.

### verify 2026-08-28T17:08:34.296Z @ e9990f29 — pass

- `pnpm exec jest --runInBand src/features/content/spanish-a1-pipeline.test.js src/data/course-catalog.test.ts` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0
