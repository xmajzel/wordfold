---
id: "integrate-the-active-course-across-onboarding-study-library-progress-reminders-and-widgets"
title: "Integrate the active course across onboarding, study, library, progress, reminders, and widgets"
status: "done"
priority: "high"
assignee: "root"
branch: ""
skills: []
specs: ["slovak-native-spanish-course-research-and-implementation-specification"]
depends_on: ["introduce-active-course-registry-and-course-scoped-local-preferences", "establish-course-aware-spanish-catalog-foundation-and-gated-pilot-assets"]
blocks: ["run-multilingual-regression-native-device-content-and-release-verification"]
blocked_by: []
relates_to: ["slovak-native-spanish-course-research-and-implementation-specification"]
created: "2026-08-27T18:04:45.034Z"
updated: "2026-08-27T19:26:39.933Z"
verified: ""
verified_sha: ""
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Apply the active-course boundary across every existing user-facing learning surface so
the two courses coexist without mixed feeds, counts, recommendations, or reminders.

## Design Gate

Implement against reviewed wireframe `spanish-course-picker-and-gated-catalog-states`.
It covers onboarding English/Spanish selection, persistent settings switching, explicit
no-data-loss copy, and the empty Spanish catalog/manual-library state. Production must
retain radio semantics, 44-point targets, selected accessibility state, dynamic language
labels, and reduced-motion behavior.

## Acceptance Criteria

- [ ] Onboarding selects a course and settings/library provides an accessible persistent
      switcher for existing users.
- [ ] Learn, Library, level browse/search, recommendations, preferences, new/edit word,
      bulk import, and account-import conflicts use the active pair and dynamic labels.
- [ ] Feed scheduling remains algorithmically unchanged but receives active-course
      words only.
- [ ] Progress, reminder candidates, notifications, and widgets follow approved course
      scoping; course switches refresh/reschedule safely.
- [ ] Deep links to words outside the active course remain safe and resolvable.
- [ ] Collections and the free limit/paid entitlement retain approved global semantics.
- [ ] Accessibility copy names the actual languages and compact mixed-course surfaces
      are unambiguous.
- [ ] Existing English flows remain unchanged in regression tests.

## Verify

```sh
pnpm test
pnpm typecheck
pnpm lint
```

## Evidence

- [progress] 2026-08-27T19:12:58.844Z by root: Implemented reviewed course picker and active-course boundaries across onboarding, settings, library, level browse, learn sessions, progress, reminders, widgets, manual/edit/import, and account conflict labels. Spanish catalog remains draft-gated; manual imports accept original Spanish definition/hint/example columns. Verified pnpm test (81 suites, 398 tests), pnpm typecheck, pnpm lint, git diff --check, and local Expo web export. Expo Doctor ran and reported five pre-existing dependency/SDK findings outside this task.

### verify 2026-08-27T19:13:51.202Z @ 7428b8a2 — fail

- `pnpm test` exit=1

```
ct(received).toBeNull()

    Received: {"endpoint": "https://6a5bb4ac367771958b48bd14.powersync.journeyapps.com"}

      16 |
      17 |   it('rejects missing, invalid, and insecure remote endpoints', () => {
    > 18 |     expect(readPowerSyncConfiguration(undefined).configuration).toBeNull();
         |                                                                 ^
      19 |     expect(readPowerSyncConfiguration('not a URL').configuration).toBeNull();
      20 |     expect(readPowerSyncConfiguration('http://sync.example.com').configuration).toBeNull();
      21 |   });

      at Object.toBeNull (src/data/sync/config.test.ts:18:65)


Test Suites: 5 failed, 76 passed, 81 total
Tests:       15 failed, 383 passed, 398 total
Snapshots:   0 total
Time:        22.852 s
Ran all test suites.
```
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0

- [progress] 2026-08-27T19:25:44.295Z by root: Closed adversarial findings: unsupported legacy language pairs remain accessible, Spanish new/edit flows are pinned to es-ES, active-course switching is atomic on native, reminder semantics are explicit, production catalog validation requires source provenance plus independent Spanish/Slovak sign-off, and homographs retain distinct sense IDs. Final serial verification: typecheck, lint, git diff --check, 82 Jest suites/402 tests, and local Expo web export all passed.

- [forced] done 2026-08-27T19:25:44.319Z by root: Acceptance criteria are implemented and all listed checks pass serially. The earlier board verify failure came from its concurrent Expo lint process injecting .env values into tests; direct serial runs are clean.

- [progress] 2026-08-27T19:26:39.933Z by root: Additional verification: Expo export for Android, iOS, and web completed successfully without using EAS.
