# Spanish expansion implementation checkpoint — 2026-09-05

## Delivered checkpoint

The reviewed picker is implemented, and the development catalog now contains 685
entries: A1 581, A2 24, B1 22, B2 19, C1 20, C2 19. This is a partial curriculum,
not completion of the approved all-level catalog objective.

- Preserved all 500 original A1 identities and their first correction ledger.
- Reconciled all 36 second-pass findings: 30 applied and six reasoned retentions.
- Authored 185 original supplemental senses across 25 objectives; independent
  Spanish and Slovak AI agents inspected every entry. Two Spanish corrections and
  three Slovak refinements were applied, then rechecked.
- Integrated self-review caught 16 adjective gender metadata errors missed in the
  first AI pass. Both reviewers checked the corrections; 169 unchanged hashes and
  16 gender-only changes were independently verified. R1 reports/preview remain
  preserved. The compiler and tests now reject missing adjective/noun gender.
- Final supplemental raw SHA-256:
  `efb38afe1a97ddeb34e34aeeb1e20f0fdf80ba586ebd20aa77b1bb52330ddcf4`.
  Canonical hash:
  `c1de4e30998438fef7213afca6d82503e62fa4ea2378f8b9ca9bfba4f3912591`.
- Strict deterministic compilation checks both independent reviews, all 185 entry
  hashes, identities, counts, original fields and unresolved findings. No native
  attestations are created. Existing untouched pending A1 human packages were
  refreshed with the pipeline's no-work check and recoverable UUID backups.

## Checks actually run

- Full direct `pnpm test`: **96 suites, 529 tests passed**. An earlier attempt
  exited 139 without a test assertion; rerun completed successfully.
- `pnpm typecheck`, `pnpm lint`, `git diff --check`: passed after fixing the new
  inventory test's missing Jest global declarations.
- Focused multi-level/search/add/identity tests, exact review reconstruction,
  editorial ledger reversal and independent coverage checks passed.
- `pnpm exec expo export --platform web --output-dir
  .artifacts/spanish-expansion/local-release-export`: succeeded, 21 routes.
  Exported Settings contains unavailable Spanish catalog copy, not the development
  preview count, even with the local preview flag enabled. Release gating tests
  also exercise `__DEV__ = false` explicitly.
- `pnpm dlx expo-doctor`: **17/22 checks passed**, with the same five pre-existing
  issues: duplicate React, dom-webview mismatch, SDK56 Hermes advisory, native
  metadata warnings, and 15 Expo patch mismatches. No dependency upgrade attempted.
- Measured mobile/desktop UI and live C2 learning/hint checks are in
  `SPANISH_COURSE_PICKER_UI_VERIFICATION.md`.

The Bun board runner auto-loads local `.env`, unlike the direct test command.
The production catalog test now explicitly selects its non-preview scenario;
the board full-suite command clears public app configuration for its test subprocess
only. Preview/configured scenarios remain covered by explicit tests.
Final board verification also passed for the picker, level-aware pipeline and
inventory checkpoint after allowing localhost test-server bindings. The inventory
task is intentionally not closed: passing its structural checks does not finish
the remaining editorial coverage.

## Still incomplete

The inventory enumerates 138 next senses, plus further unmapped areas. Existing
A1 category-template placements still need individual adjudication. A finite
vocabulary-card catalog is not complete CEFR proficiency coverage. Broad inventory
and full-catalog tasks remain open.

Native large-text, native screen-reader and actual Spanish audio QA remain
unverified here. No production release, paid audio generation, EAS cloud build,
deployment, automatic whole-catalog import, or English content changes occurred.
