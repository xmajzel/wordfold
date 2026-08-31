---
id: "establish-course-aware-spanish-catalog-foundation-and-gated-pilot-assets"
title: "Establish course-aware Spanish catalog foundation and gated pilot assets"
status: "done"
priority: "high"
assignee: "root"
branch: ""
skills: []
specs: ["slovak-native-spanish-course-research-and-implementation-specification"]
depends_on: ["approve-slovak-native-spanish-course-semantics-and-content-source-path"]
blocks: ["integrate-the-active-course-across-onboarding-study-library-progress-reminders-and-widgets"]
blocked_by: []
relates_to: ["slovak-native-spanish-course-research-and-implementation-specification"]
created: "2026-08-27T18:34:28.198Z"
updated: "2026-08-27T18:37:46.869Z"
verified: "2026-08-27T18:37:43.036Z"
verified_sha: "7428b8a26c5dcf8857cc4f742aad9917cd359dad"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Build the course-aware catalog API, schema, provenance rules, deterministic validators,
and clearly gated original Spanish pilot assets needed for app integration without
shipping unlicensed or unreviewed content as production-ready.

## Acceptance Criteria

- [x] Catalog lookup requires a course ID and preserves existing English APIs/invariants.
- [x] Spanish IDs are namespaced and cannot collide with English senses or homographs.
- [x] Spanish asset schema records language pair, CEFR level, POS, definition, example,
      Slovak hint, source evidence, attribution, and Spanish/Slovak review status.
- [x] An original, non-Cervantes-copying pilot covers all six level code paths and remains
      excluded from production browse/recommendations until independently approved.
- [x] Deterministic validation rejects missing fields, duplicate IDs/terms, unsupported
      levels, unreviewed production entries, and inconsistent manifests.
- [x] Editorial and licensing documentation records Cervantes as qualitative reference
      only and defines the review/promotion gate.
- [x] Existing English catalog tests and entry counts remain unchanged.

## Verify

```sh
pnpm test -- src/data/course-catalog.test.ts src/data/cefr-catalog.test.ts
pnpm typecheck
pnpm lint
```

## Evidence

- [progress] 2026-08-27T18:37:34.802Z by root: Added a course-aware catalog facade, namespaced Spanish identity, a six-level original draft pilot excluded from production APIs, deterministic promotion validators, homograph regression coverage, and explicit Cervantes/license/editorial policy. English 8,300-entry behavior is unchanged.

### verify 2026-08-27T18:37:43.036Z @ 7428b8a2 — pass

- `pnpm test -- src/data/course-catalog.test.ts src/data/cefr-catalog.test.ts` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
