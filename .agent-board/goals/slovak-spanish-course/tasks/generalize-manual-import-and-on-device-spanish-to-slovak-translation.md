---
id: "generalize-manual-import-and-on-device-spanish-to-slovak-translation"
title: "Generalize manual import and on-device Spanish-to-Slovak translation"
status: "done"
priority: "normal"
assignee: "implement_translation"
branch: ""
skills: []
specs: ["slovak-native-spanish-course-research-and-implementation-specification"]
depends_on: ["introduce-active-course-registry-and-course-scoped-local-preferences"]
blocks: ["run-multilingual-regression-native-device-content-and-release-verification"]
blocked_by: []
relates_to: ["slovak-native-spanish-course-research-and-implementation-specification"]
created: "2026-08-27T18:04:45.122Z"
updated: "2026-08-27T18:46:59.285Z"
verified: "2026-08-27T18:46:31.862Z"
verified_sha: "7428b8a26c5dcf8857cc4f742aad9917cd359dad"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Make manual Spanish entry and import course-aware, and enable explicit Spanish to
Slovak on-device translation without using runtime translation as catalog truth.

## Acceptance Criteria

- [x] Translation API accepts validated explicit language pairs and preserves existing
      English to Slovak behavior.
- [x] Spanish to Slovak is enabled through Android ML Kit and the iOS Spanish allowlist.
- [x] Model download, unavailable web/native module, offline, cancellation, and error
      states are clear and non-destructive.
- [x] Import defaults, examples, parsing, deduplication, and created locales follow the
      active course.
- [x] Catalog entries always use committed reviewed hints rather than runtime output.
- [x] Tests cover both pairs, Unicode/diacritics, unsupported pairs, and current English
      regression behavior.

## Verify

```sh
pnpm test -- src/features/translation src/features/import
pnpm typecheck
pnpm lint
```

## Evidence

- [progress] 2026-08-27T18:43:50.138Z by implement_translation: Implemented validated en→sk/es→sk translation with cancellation and native error states; course-aware manual/import defaults and Spanish Unicode coverage; targeted tests, typecheck, and lint pass.

### verify 2026-08-27T18:43:59.472Z @ 7428b8a2 — pass

- `pnpm test -- src/features/translation src/features/import` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0

### verify 2026-08-27T18:46:31.862Z @ 7428b8a2 — pass

- `pnpm test -- src/features/translation src/features/import` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
