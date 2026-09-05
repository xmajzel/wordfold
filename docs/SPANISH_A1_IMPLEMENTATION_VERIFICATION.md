# Spanish A1 correction and reference verification

Verified locally on 2026-09-05. This records the approved draft-only implementation;
it is not native editorial sign-off or permission to publish the catalog.

Subsequent owner-approved local preview: the 500 A1 words are now available behind
a development-only opt-in. See the in-app development preview section of
`SPANISH_CATALOG_EDITORIAL_POLICY.md` for setup and newer verification (482 tests).
The production and independent-review status recorded below remains unchanged.

## Implemented scope

- Reconciled all 94 findings from the two approved AI reports: 92 applied and two
  optional Slovak refinements retained with explicit rationale. The reversible
  `assets/catalog/spanish/a1-editorial-corrections.json` ledger records the reports,
  dispositions and exact changes. 133 entries changed; all 500 stable identities,
  category quotas and draft status remain intact.
- Corrected senses, definitions, examples, Slovak hints, adjective agreement,
  selected plural/article forms, regional notes and three nominal expressions.
  Validation caught and resolved a circular `té` definition during integration.
- Regenerated pinned OMW evidence: 500/500 exact lemma/POS matches, 3,087 grouped
  options across 2,803 distinct synsets, all with English definitions and members;
  192 distinct adjective synsets use the permitted satellite fallback. Spanish
  descriptions/examples are retained when available. No source meanings are
  machine-translated or copied into learner-facing promotion fields.
- Review UI displays language-labeled meanings, examples, members, gender/forms,
  canonical choices, Spanish attribution/license link and full WordNet license.
  It preserves edits made during autosave and saves dirty work before finalization.
- Both registered review packages were refreshed only after pending/empty-work
  checks, with exclusive locks, original-byte backups and preserved reviewer details.
  `annamariea-es` and `jozef-sk` each still have 500 pending decisions, zero notes,
  blank attestations and blank completion dates.

Canonical candidate SHA-256:
`a50d66a91a8291378bf7706465ef30e6b8baadabd72385356b7a772bbbc84b0b`.

Canonical evidence SHA-256:
`90ba6c9517078b999d909f5dc6a0329f71562a6f3a72db3d5097c126a15695be`.

## Checks

- `pnpm test`: 89 suites, 477 tests passed.
- `pnpm typecheck`, `pnpm lint`, `git diff --check`: passed.
- Source preparation against both pinned archives and byte-identical XML members,
  full 500-entry validation and pending-review scoring: passed.
- Compilation with the real pending packages and an empty in-memory adjudication
  record refused the missing Spanish attestation; no promotion output was created.
- `pnpm exec expo export --platform web --output-dir .artifacts/spanish-a1/export-2026-09-05`:
  passed, 21 static routes. No remote EAS build or deployment was started.
- Measured live review UI at 375, 768 and 1280px: no horizontal overflow; single
  content column below the 900px breakpoint and two columns above it. At 375px,
  editable form controls use 16px text and visible action buttons are at least 46px
  tall. Screenshots inspected at mobile and desktop widths.
- On disposable package copies, a pending note survived Next/Previous navigation;
  corrected `fuerte` content and plural forms rendered; source notices expanded;
  the independent Slovak view showed `hlava`, no source-option panel and no Spanish
  reviewer note. Real packages remained untouched by UI QA.

`npx --yes expo-doctor` completed with 17/22 checks passing. Its five failures concern
existing project dependencies: duplicate React via a CLI dependency, an Expo DOM
webview patch mismatch, an SDK/Hermes regression advisory, React Native Directory
metadata/New Architecture warnings, and 15 Expo patch-version mismatches. This
implementation did not change dependency versions; remediation needs a separate
dependency/native-runtime scope. Native devices and pronunciation audio were not
retested in this draft-content/review-tool change.

## Remaining release work

Native reviewers must independently select/assess the corrected senses and Slovak
hints and provide truthful completion attestations. Entry-specific A1 placement
still needs evidence; repeated category-level rationales are not sufficient.
The 500-entry quota pilot is not a complete foundational first-500 curriculum:
basic verbs, numbers, colors and time coverage need a separately specified content
pass. A2–C2 datasets and their review remain outside this implementation. Spanish
production content stays gated; the existing runtime/English catalog is unchanged.
