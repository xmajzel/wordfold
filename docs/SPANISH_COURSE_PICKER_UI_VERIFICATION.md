# Spanish course picker verification — 2026-09-05

Approved scope: `spanish-a1-c2-catalog-expansion-and-picker-completion`, UC-001/F01
and UC-002/F02. This report is AI implementation/QA evidence, not native-language
or audio approval.

## Implemented

- Settings stages a course in local state bound to the actual active course. Only
  the explicit Use button calls the switch. An in-flight ref prevents duplicate
  submissions; failure discards the pending selection and reports the error.
- Course cards show flags, accessible radio state, stable test IDs, and reassurance
  that neither library nor progress is removed.
- Settings, onboarding, ready, Library and level notices derive availability from
  catalog data. No hardcoded 500-word/A1-only claim remains. Empty levels remain
  unavailable; having entries is not described as completing a level.
- Spanish onboarding says Save my preferences rather than promising a starter set.
  English retains Create my set. No Spanish entries are automatically imported.

## Design gate and measured implemented UI

The main agent and worker rendered all six wireframe artboards before dynamic
availability implementation. Each measured 390x844 with equal client/scroll bounds.
The new partial/all-level-present states use explicitly illustrative counts.

Implemented Settings was measured in the local Expo web app at 390x844 and 1280x900:

| Measurement | Mobile | Desktop |
| --- | --- | --- |
| Course card width | 358 px | 1248 px |
| Course card height | 113 px | 104 px |
| Padding / gap / radius | 16 / 12 / 20 px | 16 / 12 / 20 px |
| Overflowing course-card text nodes | 0 | 0 |

The mobile confirm button measured 358x50 px; its label center was exactly aligned
with the button on both axes (0 px delta). Scoped elements did not extend beyond
the viewport. Token values were compared with `src/theme/tokens.ts`.

Measured selected caption contrast initially failed normal-text contrast at 4.08:1
against the selected background. Using the existing `theme.text` token corrected
it to 13.65:1; unselected captions are 5.01:1 against the white surface.

React Native Web did not emit checked state from `accessibilityState` alone.
Explicit `aria-checked` now renders true/false and the browser accessibility tree
reports the selected radio correctly. Native `accessibilityState` remains present.

The live flow verified that selecting English while Spanish was active changed
only the pending radio/button, then confirmation changed the active course.
Spanish was restored through the same explicit flow after testing. Temporary
viewport overrides were reset.

## Verification boundaries

Focused tests cover confirmation, leaving without confirmation, repeat submission,
failure recovery, disabled radio choices, actual empty/partial/production status
copy, Spanish preferences and English starter-set labeling. Root runs the final
full suite/board verification after integration with the new catalog batches.

Native large-font settings and native screen-reader/audio behavior were not run.
The browser reported reduced-motion preference false; code retains existing system
reduced-motion configuration and adds no new animation. No axe script was injected
because the available browser evaluator is read-only; accessibility checks above
use measured DOM/AX state. No pixel-diff claim is made: the wireframe is a state/flow
reference, not a screenshot of the complete existing Settings screen. Whole-app
pre-existing gradient-button contrast was not changed as part of this scoped card
contrast correction. Final multi-level count wrapping must be rerun after batch
integration (the initial worker measurement contained 500 A1 entries).

## Final integrated measurement

The main agent repeated the checks with all 685 entries (A1 581, A2 24, B1 22,
B2 19, C1 20, C2 19). At 390px the document scroll width was also 390px;
all six Library level cards measured 173.625x184px with no clipped leaf text.
Settings English/Spanish cards measured 358x113 and 358x130px respectively,
with no clipped text and correct false/true radio states. At 1280px both were
1248x104px with no text clipping or horizontal overflow. Viewport overrides
were reset afterward.

Live local C2 search → add `tergiversar` → study → reveal Slovak hint succeeded.
The study card retained C2, original definition/example, `prekrútiť; skresliť`,
and the Spanish · Spain phone-pronunciation control. Audio itself was not played
or certified. Spanish onboarding had created zero words before the explicit add.
