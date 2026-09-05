---
id: "complete-the-reviewed-spanish-course-picker-and-catalog-states"
title: "Complete the reviewed Spanish course picker and catalog states"
status: "done"
priority: "high"
assignee: "picker_implementation"
branch: ""
skills: []
specs: ["spanish-a1-c2-catalog-expansion-and-picker-completion"]
depends_on: []
blocks: []
blocked_by: []
relates_to: ["spanish-a1-c2-catalog-expansion-and-picker-completion"]
created: "2026-09-05T12:44:51.169Z"
updated: "2026-09-05T13:41:44.794Z"
verified: "2026-09-05T13:39:48.265Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

After approval of the linked expansion specification, close the verified gaps
between the reviewed four-artboard course design and current implementation.
Update/review the wireframe for available preview/partial-catalog states before
implementing those additions. Preserve unrelated working-tree changes.

## Acceptance Criteria

- [x] Onboarding cards match course identity/selection design and reassure users
      that both libraries/progress survive switching.
- [x] Settings stages a pending course and switches only via an explicit Use button;
      cancel/navigation, errors and repeat submission preserve actual active state.
- [x] Availability summaries reflect real per-level counts and dev/release gating;
      unavailable states retain manual/import actions.
- [x] Accessible radio states/labels, touch targets, wrapping and reduced motion are
      verified on the implemented UI.
- [x] English behavior, course persistence, reminders and progress remain intact.

## Verify

```sh
env -u EXPO_PUBLIC_POWERSYNC_URL -u EXPO_PUBLIC_SUPABASE_URL -u EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY -u EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY -u EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED -u EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED -u EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED pnpm test
pnpm typecheck
pnpm lint
git diff --check
```

## Evidence

The Bun-based board runner auto-loads local `.env` configuration unlike direct
`pnpm test`. Its verification command clears public application configuration for
the unit-test subprocess only, matching the direct clean-shell suite. Individual
tests continue to set and exercise configured/preview scenarios explicitly; no
application configuration or test expectations are weakened.

2026-09-05: Read all wireframe source, rendered all four artboards and measured
390x844 bounds with equal scroll dimensions. Compared current CourseSelector,
onboarding, Settings and Library source. Settings currently switches on radio
press and lacks confirmation/no-data-loss/status copy from the reviewed design.
This is a scoped follow-up, not a claim that the original task was never implemented.

- [progress] 2026-09-05T13:01:43.994Z by picker_implementation: F01 tests reproduced immediate-switch defect; Settings now stages a choice, explicitly confirms, guards duplicate submissions and resets selection after failure. 2 focused suites/8 tests passed before additional radio-disabled test. Extended wireframe awaiting rendered design review; no dynamic preview additions implemented yet.

- [progress] 2026-09-05T13:14:01.777Z by picker_implementation: UI implementation complete; main+worker reviewed6 artboards. F01 red3 failures→green. Latest4 focused suites14 tests pass incl Spanish save/English create-set regression; prior Library/level focused tests pass. Measured390/1280 Settings, fixed RNW checked-state and selected caption contrast4.08→13.65. Evidence docs/SPANISH_COURSE_PICKER_UI_VERIFICATION.md. Root owns final full verify and integrated185-entry wrapping QA; task remains inprogress until that gate.

### verify 2026-09-05T13:34:21.582Z @ c4aed38c — fail

- `pnpm test` exit=1

```
eNull()

    Received: {"endpoint": "https://6a5bb4ac367771958b48bd14.powersync.journeyapps.com"}

      16 |
      17 |   it('rejects missing, invalid, and insecure remote endpoints', () => {
    > 18 |     expect(readPowerSyncConfiguration(undefined).configuration).toBeNull();
         |                                                                 ^
      19 |     expect(readPowerSyncConfiguration('not a URL').configuration).toBeNull();
      20 |     expect(readPowerSyncConfiguration('http://sync.example.com').configuration).toBeNull();
      21 |   });

      at Object.toBeNull (src/data/sync/config.test.ts:18:65)


Test Suites: 7 failed, 89 passed, 96 total
Tests:       25 failed, 504 passed, 529 total
Snapshots:   0 total
Time:        69.336 s, estimated 72 s
Ran all test suites.
```
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0

### verify 2026-09-05T13:36:24.610Z @ c4aed38c — fail

- `env -u EXPO_PUBLIC_POWERSYNC_URL -u EXPO_PUBLIC_SUPABASE_URL -u EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY -u EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY -u EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED -u EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED -u EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED pnpm test` exit=1

```
dProcess.<anonymous> (src/features/pronunciation/review-server.test.js:86:20)

  ● pronunciation review server › rejects inconsistent ratings and invalid reviewer IDs

    Review server exited with 1. stdout= stderr=Error: listen EPERM: operation not permitted 127.0.0.1

      84 |     child.once('exit', (code) => {
      85 |       clearTimeout(timeout);
    > 86 |       rejectServer(new Error(`Review server exited with ${code}. stdout=${stdout} stderr=${stderr}`));
         |                    ^
      87 |     });
      88 |   });
      89 | }

      at ChildProcess.<anonymous> (src/features/pronunciation/review-server.test.js:86:20)


Test Suites: 3 failed, 93 passed, 96 total
Tests:       10 failed, 519 passed, 529 total
Snapshots:   0 total
Time:        68.455 s
Ran all test suites.
```
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0

### verify 2026-09-05T13:39:48.265Z @ c4aed38c — pass

- `env -u EXPO_PUBLIC_POWERSYNC_URL -u EXPO_PUBLIC_SUPABASE_URL -u EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY -u EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY -u EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED -u EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED -u EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED pnpm test` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0

- [progress] 2026-09-05T13:41:44.764Z by codex: Final integrated 685-entry layout measured at 390/1280 px with no clipping; C2 search/add/study/hint flow passed. Full board verification passed after isolating unit-test public configuration and allowing temporary localhost test servers. Web accessibility measured; system reduced-motion code retained; native font/audio QA remains in separate release verification.
