# Inline progress verification — 2026-09-05

Approved scope: keep the progress count beside its label in Library and level
detail. No catalog content, publication policy or preview notices changed.

## Implementation

- Shared ProgressCountLabel renders one unbroken number-label unit, including
  multiword labels and locale number-grouping spaces.
- Level detail wraps complete groups, retaining dots, colors, counts and the
  full accessible summary. Bold counts have an explicit 20px outer line height.
- Library tiles wrap complete pairs and can use fewer columns on narrow or
  enlarged-text layouts.
- At fontScale >= 1.5, the long visible detail label is shortened to Not started;
  its accessible summary still says added but not started. No ellipsis or font
  shrinking. This is the scoped responsive refinement, not a progress-state change.

Files: src/components/progress-count-label.tsx, src/app/level/[level].tsx,
src/app/(tabs)/library.tsx and their component/screen tests. Existing wireframe
gained standard and enlarged-text progress artboards.

## Red / green and automated evidence

Worker reproduced two failing layout assertions before changing application code.
The final full run passed: **97 suites, 534 tests** in 76.774 seconds.
This includes the new zero/large-count pair tests, narrow 320px/2x font-scale
policy assertions, unchanged accessible summary and existing course regressions.
RNTL tests verify rendering policy, not native text geometry.

- pnpm test — PASS.
- pnpm typecheck — PASS.
- pnpm lint — PASS.
- git diff --check — PASS.
- agent-board verify keep-progress-count-label-pairs-inline — PASS.
- Local Expo web export — PASS, 21 static routes, output
  .artifacts/spanish-inline-progress/export-2026-09-05.

The export is build verification, not a Spanish production-catalog release.
No EAS build, remote deployment or paid audio request was made. Expo Doctor was
not rerun for this layout-only change; the earlier five environment/dependency
warnings remain documented in SPANISH_EXPANSION_IMPLEMENTATION_VERIFICATION.md.

## Design and live measurements

Root rendered the standard mockup before application implementation and approved
its whole-pair wrap pattern. Eight sample pairs fit their containers: detail 14px,
tile 12px, maximum measured widths 134.23px and 97.5px respectively.

Root measured the actual running app in a separate QA tab:

| View | Widths | Result |
| --- | --- | --- |
| A1 level detail | 320, 390, 1280px | All four number-label pairs stayed within their progress row; one inline unit per pair |
| Library | 320, 390, 1280px | All 24 pairs across six level tiles stayed inside their wrapping containers |

Measured actual detail pairs were 20px high; Library pairs were 17px high. At
390px the long detail pair moved as a whole when required. Screenshots were
inspected as secondary evidence; the browser screenshot capture sometimes crops
the right edge after viewport changes, so containment claims use DOM rectangles.

The simulated 2x/320px wireframe used 24px labels, 28px counts and 40px line height:
8,300 Not started measured 201.98px text width inside a 254px row (plus a 10px
dot and 8px gap), with no overflow. This is design simulation, NOT actual native
large-font approval.

## Remaining verification boundary

Physical Android/iOS text scaling, screen-reader output and extreme font scales
or unusually large multi-digit counts are not verified. No claim that every
possible font/count combination can fit an atomic pair in a finite-width screen.
These native checks remain part of public-release QA.
