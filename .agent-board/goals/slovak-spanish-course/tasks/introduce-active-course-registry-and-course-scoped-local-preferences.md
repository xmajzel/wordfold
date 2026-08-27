---
id: "introduce-active-course-registry-and-course-scoped-local-preferences"
title: "Introduce active-course registry and course-scoped local preferences"
status: "done"
priority: "high"
assignee: "root"
branch: ""
skills: []
specs: ["slovak-native-spanish-course-research-and-implementation-specification"]
depends_on: ["approve-slovak-native-spanish-course-semantics-and-content-source-path"]
blocks: ["integrate-the-active-course-across-onboarding-study-library-progress-reminders-and-widgets", "generalize-manual-import-and-on-device-spanish-to-slovak-translation", "validate-and-ship-exact-locale-spanish-device-pronunciation"]
blocked_by: []
relates_to: ["slovak-native-spanish-course-research-and-implementation-specification"]
created: "2026-08-27T18:04:44.849Z"
updated: "2026-08-27T18:32:40.084Z"
verified: "2026-08-27T18:32:26.663Z"
verified_sha: "7428b8a26c5dcf8857cc4f742aad9917cd359dad"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Introduce the least-invasive course boundary so English and Spanish can coexist without
adding a course column to every word or changing existing English behavior.

## Acceptance Criteria

- [x] A typed registry defines `en-sk` and `es-sk`, locales, labels, catalog adapters,
      and pronunciation/translation capabilities.
- [x] A word's course is derived deterministically from its language pair.
- [x] Existing installations default to `en-sk` with all prior metadata preserved.
- [x] Active course and approved per-course preferences persist across restarts with
      backward-compatible parsing.
- [x] Pronunciation preference becomes learning-language/course scoped.
- [x] No local, PowerSync, or Supabase word-table migration is introduced unless the
      approved specification changes.
- [x] Repository/provider/web-provider tests cover migration, switching, persistence,
      empty courses, and no cross-course data loss.

## Verify

```sh
pnpm test -- src/domain/courses.test.ts src/data/repository.test.ts src/providers/app-data-provider.test.tsx src/providers/app-data-provider.web.test.tsx
pnpm typecheck
pnpm lint
```

## Evidence

- [progress] 2026-08-27T18:26:04.897Z by root: Implemented typed en-sk/es-sk registry, deterministic language-pair derivation, backward-compatible active-course persistence, course-scoped levels/topics/filter/voice settings, native/web provider switching, and focused tests. No word schema was changed.

### verify 2026-08-27T18:26:14.985Z @ 7428b8a2 — fail

- `pnpm test -- src/data src/providers src/domain` exit=1

```
nt": "https://6a5bb4ac367771958b48bd14.powersync.journeyapps.com"}

      16 |
      17 |   it('rejects missing, invalid, and insecure remote endpoints', () => {
    > 18 |     expect(readPowerSyncConfiguration(undefined).configuration).toBeNull();
         |                                                                 ^
      19 |     expect(readPowerSyncConfiguration('not a URL').configuration).toBeNull();
      20 |     expect(readPowerSyncConfiguration('http://sync.example.com').configuration).toBeNull();
      21 |   });

      at Object.toBeNull (src/data/sync/config.test.ts:18:65)


Test Suites: 1 failed, 23 passed, 24 total
Tests:       1 failed, 115 passed, 116 total
Snapshots:   0 total
Time:        2.034 s
Ran all test suites matching /src\/data|src\/providers|src\/domain/i.
```
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0

### verify 2026-08-27T18:26:44.943Z @ 7428b8a2 — fail

- `pnpm test -- src/data src/providers src/domain` exit=1

```
a5bb4ac367771958b48bd14.powersync.journeyapps.com"}

      16 |
      17 |   it('rejects missing, invalid, and insecure remote endpoints', () => {
    > 18 |     expect(readPowerSyncConfiguration(undefined).configuration).toBeNull();
         |                                                                 ^
      19 |     expect(readPowerSyncConfiguration('not a URL').configuration).toBeNull();
      20 |     expect(readPowerSyncConfiguration('http://sync.example.com').configuration).toBeNull();
      21 |   });

      at Object.toBeNull (src/data/sync/config.test.ts:18:65)


Test Suites: 1 failed, 23 passed, 24 total
Tests:       1 failed, 115 passed, 116 total
Snapshots:   0 total
Time:        1.843 s, estimated 2 s
Ran all test suites matching /src\/data|src\/providers|src\/domain/i.
```
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0

### verify 2026-08-27T18:32:26.663Z @ 7428b8a2 — pass

- `pnpm test -- src/domain/courses.test.ts src/data/repository.test.ts src/providers/app-data-provider.test.tsx src/providers/app-data-provider.web.test.tsx` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
