---
id: "spanish-course-picker-and-gated-catalog-states"
title: "Spanish course picker and gated catalog states"
status: "reviewed"
category: "design"
entry: "index.html"
created: "2026-08-27T18:39:31.840Z"
updated: "2026-08-27T18:39:31.840Z"
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
