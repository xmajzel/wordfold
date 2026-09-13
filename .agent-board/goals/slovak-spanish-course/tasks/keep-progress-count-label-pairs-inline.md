---
id: "keep-progress-count-label-pairs-inline"
title: "Keep progress count-label pairs inline"
status: "done"
priority: "high"
assignee: "picker_implementation"
branch: ""
skills: []
specs: ["spanish-public-v1-and-inline-progress"]
depends_on: []
blocks: []
blocked_by: []
relates_to: []
created: "2026-09-05T14:11:47.799Z"
updated: "2026-09-05T14:38:40.294Z"
verified: "2026-09-05T14:37:05.672Z"
verified_sha: "105b32ae17bf826deba27f0ecb5ff9766f6fc826"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Implement only the inline progress subsection of the linked spec. The owner
explicitly requested the previously proposed `0 Known` correction on 2026-09-05.
Keep each number-label pair together in Library and level detail, allowing whole
pairs to wrap. Preserve calculations, colors, accessible summaries and other work.
No data, migration, API, catalog publication or preview-label changes are included.

## Acceptance Criteria

- [x] Review a small wireframe update before implementation.
- [x] Known, Learning, Added and remaining counts have inline unbroken number-label units.
- [x] Narrow screens and large counts wrap whole pairs without clipping or shrinking text in the measured web and simulated stress scenarios.
- [x] Targeted regression tests, TypeScript and lint pass; measured UI evidence is recorded.

## Verify

```sh
pnpm exec jest --runInBand src/features/translation/cefr-level-screen.test.tsx src/features/learning/library-course-visibility.test.tsx
pnpm typecheck
pnpm lint
git diff --check
```

Root verification: docs/SPANISH_INLINE_PROGRESS_VERIFICATION.md records 97 suites/
534 tests, TypeScript/lint/board verification, local export and live 320/390/1280px
measurements. The full accessible summary is retained when fontScale >= 1.5 uses
compact visible Not started. Physical native large-text and extreme combinations
remain unverified; these are explicitly not claimed by this scoped web fix.

## Evidence

- [progress] 2026-09-05T14:21:22.896Z by picker_implementation: Design gate reviewed by root before code:8wholepairs inside artboard, baselineinline, gap4px. Red2 screen assertions failed before implementation; green3 focused suites12tests now pass. Shared NBSP unit preserves counts, leveldots/colors and accessible summaries, wholepairs wrap, libraryfontscale minwidth allows fewercolumns. Awaiting root livegeometry/fullverify; worker CUA has no enabled browser.

### verify 2026-09-05T14:37:05.672Z @ 105b32ae — pass

- `pnpm exec jest --runInBand src/features/translation/cefr-level-screen.test.tsx src/features/learning/library-course-visibility.test.tsx` exit=0
- `pnpm typecheck` exit=0
- `pnpm lint` exit=0
- `git diff --check` exit=0
