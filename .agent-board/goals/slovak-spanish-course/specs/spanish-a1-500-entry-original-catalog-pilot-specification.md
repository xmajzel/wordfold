---
id: "spanish-a1-500-entry-original-catalog-pilot-specification"
title: "Spanish A1 500-entry original catalog pilot specification"
status: "proposed"
category: "content"
created: "2026-08-27T22:16:21.120Z"
updated: "2026-08-27T22:16:21.120Z"
---

## Context

The Spanish course infrastructure is complete, but normal catalog APIs intentionally
expose no Spanish entries. The next approved milestone is an original 500-entry A1
editorial pilot that proves the source, authoring, validation, and independent-review
workflow before Wordfold scales through A2-C2.

Instituto Cervantes granted Wordfold permission on 2026-08-27 to use the Plan
Curricular del Instituto Cervantes (PCIC) as a commercial reference framework and to
reference its levels, categories, and classifications. This permission does not allow
unrestricted reproduction of PCIC prose or a bulk copy of its lexical inventories.
The pilot therefore uses only the 20 top-level `Nociones específicas` classifications
as curriculum structure. Every selected term, sense decision, Spanish definition,
Spanish example, and Slovak hint is independent Wordfold editorial work.

This specification covers a draft pilot and review tooling. It does not promote any
entry into the production application. Promotion is a later task after two qualified,
distinct reviewers approve the exact immutable candidate payload.

## Decisions

1. Produce exactly 500 original A1 candidates. The count is an editorial calibration
   target, not a count prescribed by PCIC.
2. Use these Wordfold-authored coverage quotas:

   | PCIC classification | Count |
   | --- | ---: |
   | 1. Individuo: dimensión física | 30 |
   | 2. Individuo: dimensión perceptiva y anímica | 25 |
   | 3. Identidad personal | 35 |
   | 4. Relaciones personales | 30 |
   | 5. Alimentación | 50 |
   | 6. Educación | 25 |
   | 7. Trabajo | 20 |
   | 8. Ocio | 25 |
   | 9. Información y medios de comunicación | 15 |
   | 10. Vivienda | 35 |
   | 11. Servicios | 20 |
   | 12. Compras, tiendas y establecimientos | 35 |
   | 13. Salud e higiene | 25 |
   | 14. Viajes, alojamiento y transporte | 40 |
   | 15. Economía e industria | 10 |
   | 16. Ciencia y tecnología | 10 |
   | 17. Gobierno, política y sociedad | 5 |
   | 18. Actividades artísticas | 15 |
   | 19. Religión y filosofía | 5 |
   | 20. Geografía y naturaleza | 45 |

3. Pin Open Multilingual Wordnet Spanish `omw-es:2.0` as reusable lemma, POS,
   synset/ILI, and sense evidence. It packages Spanish MCR 3.0 release 2016 under
   CC BY 3.0. Record the release URL, archive SHA-256, attribution, extraction method,
   and every selected sense. Do not ingest the separately licensed English MCR data.
4. Target at least 80% OMW sense grounding. Every exception, including function words
   absent from WordNet, requires an `original-editorial` evidence record and rationale.
5. Google Books Ngram Spanish corpus `googlebooks-spa-20200217`, years 2000-2019, may
   be used only as optional aggregate ranking evidence. Frequency never assigns CEFR
   level or sense automatically, and raw n-gram rows are not bundled.
6. Author candidates in five independently validated chunks of 100. Agent-authored
   content is always draft and does not count as Spanish or Slovak review.
7. Store review decisions separately from candidates. A Spanish reviewer approves the
   lemma, sense, A1 placement, POS, category, definition, example, and neutral usage. A
   Slovak reviewer approves the hint for that exact sense. Reviewer IDs must differ.
8. Bind each review package to the candidate SHA-256. Any candidate edit invalidates
   prior decisions for that entry. Requested changes require a recorded adjudication
   and renewed approval.
9. Keep the existing six-entry schema pilot and all 500 new candidates outside normal
   runtime catalog APIs. Do not add a developer bypass or weaken production gates.
10. Use the approved attribution:

    > Spanish learning content structured according to the Plan Curricular del
    > Instituto Cervantes (PCIC), A1-C2. Wordfold's vocabulary, definitions, examples,
    > and Slovak learning hints are original content. Wordfold is not certified,
    > accredited, or endorsed by Instituto Cervantes.

## Expected behavior

- A deterministic command validates the source manifest and all 500 candidates.
- A preparation command creates independent Spanish and Slovak review packages under
  `.artifacts/`, without reviewer answers or one reviewer's decisions leaking into the
  other package.
- A scoring command reports coverage, approvals, requested changes, missing reviews,
  reviewer independence, and invalidated decisions.
- A compile command refuses to produce a promotion candidate until all 500 entries are
  approved by both reviewers and all adjudications are resolved.
- The installed application continues to show the honest empty Spanish catalog state
  throughout this pilot.

## Candidate data model

Each candidate must contain:

- namespaced `id` and `catalogSenseId` beginning with `es-sk:a1:`;
- `term`, Spanish-normalized term, `level: A1`, controlled universal POS, and display
  POS;
- one explicit sense, original Spanish definition, original Spanish example, the exact
  surface form used in that example, and a sense-matched Slovak hint;
- primary PCIC classification ID/label plus a Wordfold A1-placement rationale;
- noun/adjective gender and structured alternative forms where applicable;
- OMW version/lemma/synset/ILI/confidence evidence, or a documented original-editorial
  exception;
- original-content declaration, authoring batch, source version, and draft status.

Review files must contain a catalog hash, review kind, reviewer ID, qualification,
attestation, review date, and exactly one decision per candidate sense. Adjudications
must retain the before/after value, reason, adjudicator, and decision date.

## Validation rules

- Exactly 500 A1 records and exact category quotas; no A2-C2 records.
- Unique IDs and sense IDs. Homographs are allowed only with distinct senses,
  definitions, POS/evidence, and IDs.
- Spanish Unicode normalization preserves diacritics and `ñ` while rejecting empty or
  inconsistent normalized forms.
- Definitions contain 3-24 words and are not circular. Examples contain 4-24 words and
  include the declared surface form. Slovak hints contain 1-12 words.
- Controlled POS/gender combinations, documented reflexive-verb identity, canonical
  adjective form, and explicit multiword-expression status.
- No URLs, markup, control characters, duplicate definitions/examples, or copied PCIC
  inventory prose in learner-facing fields.
- Source versions, URLs, 64-character SHA-256 values, licenses, attributions, and
  redistribution scope are complete.
- Review payload hashes match the candidate payload; all decisions are independent and
  complete before a promotion artifact can be compiled.

## Files likely to change after approval

- `assets/catalog/spanish/a1-candidates.json`
- `assets/catalog/spanish/a1-lexical-evidence.json`
- `assets/catalog/spanish/a1-source-manifest.json`
- `assets/catalog/spanish/reviews/` for completed review/adjudication evidence only
- `scripts/prepare-spanish-a1-sources.mjs`
- `scripts/validate-spanish-a1-candidates.mjs`
- `scripts/prepare-spanish-a1-review.mjs`
- `scripts/compile-spanish-a1-pilot.mjs`
- focused CLI/unit tests under `src/features/content/`
- `package.json`, `assets/licenses/CONTENT_SOURCES.md`, and the Spanish editorial policy

No runtime screen, provider, repository, database, sync schema, backend, pronunciation,
English catalog, or production Spanish asset changes are part of this phase.

## Edge cases

- Spanish homographs and polysemy; one entry must never silently stand for two senses.
- Reflexive versus non-reflexive verbs and verbs whose meaning changes with a pronoun.
- Noun/adjective gender, irregular plurals, invariant/common-gender forms, and
  canonical presentation forms.
- Diacritics, `ñ`, punctuation, clitics, phrases, abbreviations, and Unicode variants.
- Regional vocabulary: exclude or label it; the pilot targets neutral broadly
  understood Spanish and `es-ES` pronunciation.
- Proper names, transparent inflections, and arbitrary phrase fragments are excluded
  unless an explicit editorial rationale says otherwise.
- One term may map to multiple PCIC themes; store one primary quota category and
  optional secondary classifications without double-counting.
- OMW omissions or low-confidence mappings require a visible exception, never an
  invented sense ID.

## Risks and assumptions

- Generated definitions, examples, levels, and translations can be wrong or unnatural;
  automation cannot substitute for the two human reviews.
- OMW supplies lexical evidence, not CEFR grading or complete learner definitions.
- Google Books frequency is book-biased and surface-form based; it is advisory only.
- The PCIC permission permits framework/category use but not unrestricted content
  reproduction; candidates must be selected and written independently.
- Reviewer availability remains an external release dependency.

## Explicitly unchanged

- No production Spanish entries become visible.
- No claim of a complete A1 or A1-C2 course is added.
- No Instituto Cervantes logo, certification, accreditation, validation, or endorsement
  claim is added.
- No English content, scheduling behavior, user data, database schema, remote service,
  paid generation, deployment, EAS build, or native build is changed or invoked.

## Minimal acceptance criteria

1. Source and permission manifests are complete, pinned, attributed, and validate.
2. Exactly 500 draft candidates satisfy the quotas and deterministic structural/content
   checks; at least 80% have pinned OMW sense evidence and all exceptions are justified.
3. Review preparation, hashing, scoring, and promotion refusal are covered by tests.
4. No candidate appears in normal application catalog APIs.
5. Existing Spanish pilot and all English catalog tests remain green.
6. `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `git diff --check` pass.

## Tasks

1. Pin and extract the reusable Spanish lexical evidence and provenance manifest.
2. Implement deterministic candidate, review, and promotion-gate tooling with tests.
3. Author and validate five original 100-entry A1 candidate batches.
4. Prepare immutable Spanish and Slovak reviewer packages.
5. Obtain independent reviews, adjudicate changes, and revalidate exact hashes.
6. Specify and execute a separate reviewed-A1 production promotion after sign-off.
