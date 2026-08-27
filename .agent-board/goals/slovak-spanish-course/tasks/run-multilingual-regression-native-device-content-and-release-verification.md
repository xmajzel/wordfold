---
id: "run-multilingual-regression-native-device-content-and-release-verification"
title: "Run multilingual regression, native-device, content, and release verification"
status: "todo"
priority: "high"
assignee: ""
branch: ""
skills: []
specs: ["slovak-native-spanish-course-research-and-implementation-specification"]
depends_on: ["integrate-the-active-course-across-onboarding-study-library-progress-reminders-and-widgets", "generalize-manual-import-and-on-device-spanish-to-slovak-translation", "validate-and-ship-exact-locale-spanish-device-pronunciation", "add-spanish-public-private-and-downloadable-neural-pronunciation-parity"]
blocks: []
blocked_by: []
relates_to: ["slovak-native-spanish-course-research-and-implementation-specification"]
created: "2026-08-27T18:04:45.395Z"
updated: "2026-08-27T18:06:00.700Z"
verified: ""
verified_sha: ""
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Execute the complete content, application, backend, native-device, and release gate for
the approved Spanish-course milestones and document any excluded remote build.

## Acceptance Criteria

- [ ] All catalog/content validators and Spanish/Slovak reviewer sign-offs are recorded.
- [ ] Jest, TypeScript, lint, Expo Doctor, and local Expo export pass.
- [ ] Local Android/iOS builds pass for changed native modules and database code.
- [ ] Real-device course switching, Spanish speech, translation model download/offline
      behavior, reminders, notification deep links, widgets, account sync/import, and
      airplane-mode audio are verified.
- [ ] English catalog, learning, pronunciation, purchases, sync, reminders, and widget
      behavior has no regression.
- [ ] Bundle/catalog/audio sizes and cloud generation/storage costs are measured.
- [ ] Anything not tested, including any unapproved EAS build, is explicit in release
      evidence.

## Verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm exec expo-doctor
pnpm exec expo export --platform all
```
