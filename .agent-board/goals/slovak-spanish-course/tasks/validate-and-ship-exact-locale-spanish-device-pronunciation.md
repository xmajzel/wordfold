---
id: "validate-and-ship-exact-locale-spanish-device-pronunciation"
title: "Validate and ship exact-locale Spanish device pronunciation"
status: "blocked"
priority: "normal"
assignee: "pronunciation_audio_audit"
branch: ""
skills: []
specs: ["slovak-native-spanish-course-research-and-implementation-specification"]
depends_on: ["approve-slovak-native-spanish-course-semantics-and-content-source-path", "introduce-active-course-registry-and-course-scoped-local-preferences"]
blocks: ["run-multilingual-regression-native-device-content-and-release-verification"]
blocked_by: ["Local implementation and automated verification are complete, but acceptance requires physical Android/iOS evidence for exact es-ES installed/missing behavior, iOS silent mode, airplane-mode live/file synthesis, and native-speaker regional/quality review. These were not available in this environment and are explicitly not claimed; use docs/SPANISH_DEVICE_PRONUNCIATION_QA.md to record them before release."]
relates_to: ["slovak-native-spanish-course-research-and-implementation-specification"]
created: "2026-08-27T18:04:45.212Z"
updated: "2026-08-27T18:46:58.972Z"
verified: ""
verified_sha: ""
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Ship the existing phone-voice pronunciation path for Spanish with exact regional voice
selection, honest offline claims, and Android/iOS device evidence.

## Acceptance Criteria

- [ ] `es-ES` and every approved additional locale select only an exact installed voice
      and never silently cross regions or languages.
- [ ] Voice preference, labels, sample text, missing-voice guidance, accessibility, and
      source-language pronunciation behavior are course-aware.
- [ ] Live speech, file synthesis, 64 MiB caching, corruption cleanup, and one-time
      fallback retain current safeguards.
- [ ] Android and iOS physical-device tests cover installed/missing voices, iOS silent
      mode, and airplane mode; offline capability is claimed only when observed.
- [ ] Web continues to use browser speech with documented platform limitations.
- [ ] Existing English and Slovak pronunciation tests remain green.

## Verify

```sh
pnpm test -- src/features/pronunciation src/components/pronunciation
pnpm typecheck
pnpm lint
```

## Evidence

- [progress] 2026-08-27T18:43:33.572Z by pronunciation_audio_audit: Implemented course-aware device voice picker and offline screen for Spanish: device-only es-ES choice/sample, exact locale/region labels and accessibility, no English neural/offline packs, and honest device-dependent offline guidance. Added es-ES exact-selection, es-MX non-fallback, source-locale, missing-guidance, settings, and regression tests. Added docs/SPANISH_DEVICE_PRONUNCIATION_QA.md with web limitations and Android/iOS physical-device/native-review evidence matrix. Local checks: pronunciation suites 149/149 passed; full suite 390/390 passed; typecheck passed; lint passed. Physical Android/iOS installed/missing/silent/airplane checks remain not run and are explicitly not claimed.

### verify 2026-08-27T18:44:02.834Z @ 7428b8a2 — fail

- `pnpm test -- src/features/pronunciation src/components/pronunciation` exit=1

```
ase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."

      237 |   });
      238 |
    > 239 |   it('runs the full generation path against a local fake Azure endpoint', async () => {
          |   ^
      240 |     let receivedBody = '';
      241 |     const server = createServer((incoming: any, outgoing: any) => {
      242 |       incoming.setEncoding('utf8');

      at it (src/features/pronunciation/public-edge-core.test.ts:239:3)
      at Object.describe (src/features/pronunciation/public-edge-core.test.ts:205:1)


Test Suites: 2 failed, 24 passed, 26 total
Tests:       4 failed, 145 passed, 149 total
Snapshots:   0 total
Time:        17.966 s
Ran all test suites matching /src\/features\/pronunciation|src\/components\/pronunciation/i.
```
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0

### verify 2026-08-27T18:44:58.316Z @ 7428b8a2 — fail

- `pnpm test -- src/features/pronunciation src/components/pronunciation` exit=1

```
ase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."

      237 |   });
      238 |
    > 239 |   it('runs the full generation path against a local fake Azure endpoint', async () => {
          |   ^
      240 |     let receivedBody = '';
      241 |     const server = createServer((incoming: any, outgoing: any) => {
      242 |       incoming.setEncoding('utf8');

      at it (src/features/pronunciation/public-edge-core.test.ts:239:3)
      at Object.describe (src/features/pronunciation/public-edge-core.test.ts:205:1)


Test Suites: 2 failed, 24 passed, 26 total
Tests:       4 failed, 145 passed, 149 total
Snapshots:   0 total
Time:        17.518 s
Ran all test suites matching /src\/features\/pronunciation|src\/components\/pronunciation/i.
```
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0

- [progress] 2026-08-27T18:46:58.942Z by pronunciation_audio_audit: Final local evidence: task verify test command passes manually with 26 suites / 150 tests; typecheck and lint pass. The board verifier runs all three commands concurrently and twice timed out unrelated fake HTTP edge tests while the same pronunciation command passed immediately before/after in serial. Focused Spanish/device suites pass 29/29. A later full-repo run reached 79/80 suites and failed only settings-account mocks because concurrent active-course work now expects activeCourse; that file is outside this task and was not modified here. Spanish web copy now explicitly says browser speech requires exact es-ES, varies by browser/OS, and has no Wordfold download/cache. Physical Android/iOS and native-speaker voice review remain pending.

## Blocker

Local implementation and automated verification are complete, but acceptance requires physical Android/iOS evidence for exact es-ES installed/missing behavior, iOS silent mode, airplane-mode live/file synthesis, and native-speaker regional/quality review. These were not available in this environment and are explicitly not claimed; use docs/SPANISH_DEVICE_PRONUNCIATION_QA.md to record them before release.
