# Spanish catalog expansion

## Scope and release boundary

The 2026-09-05 owner approval covers original PCIC-referenced curriculum authoring,
independent Spanish/Slovak AI review, local previews, and the reviewed course picker.
It does not turn an AI assessment into a native-speaker attestation, certify the
curriculum, or approve production release. Existing human-review packages remain
separate. Available vocabulary is not a complete CEFR level or every Spanish word.

The legacy 500-entry A1 pilot retains all stable IDs and its editorial history.
`second-editorial-corrections.json` records the next reconciliation: 30 applied
findings and six reasoned retentions across the A1 candidates and prototype asset.
The six original prototypes are fixtures, not an upper-level production corpus.

## Original supplemental batch workflow

`assets/catalog/spanish/expansion-candidates.json` holds original supplemental
senses. Its level counts are derived from selected learning objectives. Every entry
has a stable sense ID, original Spanish definition/example, Slovak hint, morphology,
register, specific placement rationale, reference IDs and explicit placement status.
PCIC is acknowledged as the reference framework; protected learner-facing prose is
not copied. Inventory coverage and outstanding gaps are tracked separately from
the number of entries available in the app.

The expansion pipeline is a deliberately separate draft lane. The existing A1
licensed evidence and human-release pipeline is not relaxed to accommodate it.
Commands below do not call paid services or deploy anything:

```sh
pnpm spanish:expansion:validate
pnpm spanish:expansion:review-template --kind spanish --reviewer spanish-ai-agent --output /private/tmp/spanish-expansion-review.json
pnpm spanish:expansion:review-template --kind slovak --reviewer slovak-ai-agent --output /private/tmp/slovak-expansion-review.json
```

Templates start pending. Separate reviewers must inspect every entry, record notes
and findings, and date their assessments. Input dataset and per-entry SHA-256 hashes
bind coverage to the exact revision. Corrections invalidate old coverage: retain
the previous report and obtain a fresh review for the corrected input. Missing,
duplicate, stale or unresolved coverage prevents preview compilation. Merely
generating a template is not a review.

```sh
pnpm spanish:expansion:compile-preview --spanish /private/tmp/spanish-expansion-review.json --slovak /private/tmp/slovak-expansion-review.json --output /private/tmp/spanish-expansion-preview.json
```

Outputs are exclusive-create to avoid silently overwriting prior work. The compiler
emits only original learner fields plus review hashes, keeps `publicationStatus:
draft`, and labels curriculum coverage `partial`. It cannot produce native signoffs
or a production release. Reviewed preview artifacts are checked into the catalog
with their exact AI review evidence; tests reproduce the output deterministically.

## Local use

Keep `EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED=true` in ignored `.env.local` and restart
Expo after changing the flag. The legacy flag name now covers the original A1 pilot
and reviewed supplemental levels. It has no effect when `__DEV__` is false.

Choose **Slovak → Spanish** in Settings, press **Use Spanish course**, then open
Library → Discover. Counts come from the catalog rather than a fixed A1-only
message. Add selected entries to your own library; no batch is automatically added
to your study queue. English words and progress are retained when switching.
Device pronunciation continues to request `es-ES`; these content reviews do not
establish native-device audio quality. Neural/offline Spanish audio is unchanged.

## Verification

Focused tests cover level-aware validation, stale/missing review rejection,
deterministic preview compilation, development/release gating, stable catalog
lookups and staged course-switch behavior. Full Jest, TypeScript, lint, Expo Doctor,
local export and measured web UI checks are recorded in the implementation evidence.
No EAS build, remote deployment or paid audio generation is part of this workflow.
