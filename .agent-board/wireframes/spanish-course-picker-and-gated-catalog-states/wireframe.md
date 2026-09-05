---
id: "spanish-course-picker-and-gated-catalog-states"
title: "Spanish course picker and gated catalog states"
status: "reviewed"
category: "design"
entry: "index.html"
created: "2026-08-27T18:39:31.840Z"
updated: "2026-09-05T13:39:00.000Z"
---

## Notes

Reviewed against the approved Spanish-course specification on 2026-08-27.

- Coverage: onboarding default/selected states, persistent settings switcher, data-loss
  reassurance, and honest empty Spanish-catalog state.
- Flow: course is chosen as one radio group; settings confirms the switch; Spanish
  Library offers manual add/import while reviewed catalog content is unavailable.
- Measurements: all four artboards are 390 x 844 with no horizontal or vertical
  overflow; existing Wordfold color, spacing, card, gradient, and type tokens are used.
- Accessibility handoff: production cards must use `Pressable` radio semantics,
  selected state, 44-point minimum targets, dynamic language labels, and system
  reduced-motion behavior.
- Verdict: implementation-ready. No blocking design findings. Residual risk is native
  font/large-text wrapping, which must be checked in implemented UI QA.

## Implementation audit — 2026-09-05

The original linked integration task is marked done, and course choice, settings
switching and gated Spanish catalog behavior exist in the app. This board's
`reviewed` state describes design review, not full pixel/flow parity.

Current differences: Settings applies the radio choice immediately instead of using
the designed `Use Spanish course` confirmation; the implementation uses generic
language icons rather than the flags and lacks the design's explicit no-data-loss
reassurance in the course-selection sections. Availability copy also needs to
represent the newer development-only 500-entry A1 preview, not just the original
unavailable-catalog state. Existing A2-C2 production content is still absent.

All four artboards were reopened and measured at 390x844 with no internal scroll
overflow. A scoped follow-up is proposed in
`spanish-a1-c2-catalog-expansion-and-picker-completion`, task
`complete-the-reviewed-spanish-course-picker-and-catalog-states`. The wireframe
remains reviewed; this audit does not claim the follow-up has been implemented.

## Expansion design gate — 2026-09-05

Added two illustrative Library artboards: partial preview and all levels present
(explicitly not complete). Counts are marked as dynamic placeholders, not fabricated
catalog totals. Both worker and main agent rendered all six artboards through the
local HTTP preview, inspected screenshots and measured each at 390x844 with equal
client/scroll bounds. Main approved the extension for implementation. Actual data
counts, draft notices and manual/import actions must remain truthful in all states.

## Implemented checkpoint — 2026-09-05

The earlier audit gaps are now resolved: flag radio cards, explicit Settings
confirmation, no-data-loss reassurance, actual per-level availability and local
preview notices are implemented. The design record stays `reviewed` because that
is its design-review state; implementation evidence is in
`docs/SPANISH_COURSE_PICKER_UI_VERIFICATION.md` and
`docs/SPANISH_EXPANSION_IMPLEMENTATION_VERIFICATION.md`.

The final preview contains 685 entries across A1-C2, with every level explicitly
partial. Main measured the final six-level count text at 390px and 1280px with no
clipping or document overflow, and verified a C2 entry through search/add/study/hint.
Native large-text and audio validation remain separate outstanding checks.
