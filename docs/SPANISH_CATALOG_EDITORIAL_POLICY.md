# Spanish catalog editorial and release policy

## Status and direction

The Spanish course teaches Spanish to Slovak-native learners. Runtime identity is
`es-sk`: Spanish is the learned, defined, example, and pronounced language; Slovak is
the revealable hint language.

`assets/catalog/spanish/cefr-pilot.json` is original Wordfold draft content retained
as historical, non-gating evidence for the retired six-entry pilot. Normal catalog
APIs exclude it. The runtime imports the promoted A1-only production asset at
`assets/catalog/spanish/a1-course.json`; A2-C1 remain not yet available and C2 is
unsupported by the current ELELex source.

## Instituto Cervantes reference boundary

Instituto Cervantes granted Wordfold written permission on 2026-08-27 to use the Plan
Curricular del Instituto Cervantes (PCIC) as a reference framework for the development,
organization, and classification of Spanish-learning content across A1-C2 in a
commercial digital application. Relevant PCIC levels, categories, and classifications
may be referenced in the content structure. The redacted correspondence is retained in
`docs/legal/INSTITUTO_CERVANTES_PCIC_PERMISSION.md`.

Wordfold may describe the curriculum as “Spanish learning content structured according
to the Plan Curricular del Instituto Cervantes (PCIC), A1-C2.” It must not imply
certification, accreditation, endorsement, or official validation, and must not use the
Instituto Cervantes logo or name as a promotional mark without separate authorization.

The permission does not authorize unrestricted reproduction of protected PCIC content.
Every shipped headword list, definition, example, Slovak hint, and other learner-facing
text must come from an independently licensed source or be original Wordfold work with
its own evidence and review trail.

## Entry policy

- Nouns use a stable lemma. Gender and irregular plural information must be handled by
  a documented presentation rule before production content is created.
- Verbs use the infinitive. Reflexive/pronominal verbs remain distinct when the
  pronoun changes meaning or normal learner usage.
- Adjectives use one documented canonical gender form while preserving important
  alternative forms in structured editorial evidence.
- Inflected forms are separate entries only when independently levelled or required to
  teach an irregular, lexicalized, or highly frequent form.
- Multiword expressions are included only when they have a stable meaning and source
  evidence. Arbitrary example fragments are excluded.
- Homographs require separate sense identities when definitions or parts of speech
  differ. IDs always start with `es-sk:`.
- Proper names, abbreviations, loanwords, and regional variants require an explicit
  inclusion reason.
- Initial content uses neutral broadly understood Spanish. Regional pronunciation
  locale is separate from catalog identity; the first catalog does not fork into
  Spain and Mexico vocabulary variants.

## Level and writing policy

Level assignments are described as CEFR-aligned, never official. Each entry retains
its level evidence and source version. Conflicting or weak evidence is review-gated.

Definitions and examples are original concise Spanish. They must match the selected
sense and level, avoid circular definitions, and avoid copying dictionary or course
text. Slovak hints must match that same sense rather than merely the most common
translation of the spelling.

### Scope of the 500-entry draft

This quota-based editorial pilot tests the content and review process. It is not a
self-contained first-500 course: core verbs, time words, numbers, and colors are
not comprehensively represented. No external lesson that supplies those gaps is
assumed. Release planning must separately establish that coverage before presenting
the pilot as a complete beginner course.

The September 2026 editorial review identified repeated category-only level
rationales. A category is not evidence for an A1 placement. The draft labels must
be validated sense by sense, particularly the flagged science, technology,
government, economics, industry, agriculture, energy, fiction, faith, and philosophy
vocabulary. Do not silently move entries across levels merely to obtain a passing
validator; replacement terms and quota changes require an explicit curriculum
decision. Original learner-friendly wording is also not proof of an official level.

### Grammatical and regional presentation

The draft records grammatical gender independently of whether a lemma contains
spaces. Nominal expressions such as `tiempo libre`, `correo electrónico`, and
`oficina de correos` use NOUN and their normal gender, with stable catalog IDs.
Canonical adjectives retain the existing headword and record useful feminine forms;
important plurals and article constructions belong in `alternativeForms`, rather
than becoming extra counted entries. Feminine `agua` and `hambre` retain feminine
agreement despite singular `el`; `vacaciones` retains its usual plural headword.
Regular paradigms are not exhaustively duplicated. These fields are exposed to the
editorial reviewer; their eventual learner presentation is a production decision.

The first pronunciation locale remains `es-ES`. Spain-preferred vocabulary, such as
`móvil`, may be retained when explicitly documented with useful alternatives such as
`celular`. A regional alternative is evidence for the same intended meaning, not a
new CEFR entry or a reason to silently change pronunciation locale.

### Approved editorial corrections

`assets/catalog/spanish/a1-editorial-corrections.json` records the reconciled
September 2026 Spanish and Slovak AI findings, with before/after fields and reasons.
Owner approval authorizes these draft edits. It does not write native-speaker
decisions or attestations. The original reports remain unchanged; after candidate
edits, their old hashes document the reviewed baseline rather than the new payload.

The A2 correction layer is
`assets/catalog/spanish/a2-ai-cross-review-adjudications.json`. Its 23 unique content
findings comprise 19 material-definition findings, including all four wrong-sense
findings, plus four example-only findings. Only `solar` and `querido` remain semantic
exceptions. Their generated OMW sense is explicitly rejected and the corresponding
Slovak hint is stale; repaired entries must pass post-correction external-reference
QA before compilation.

`assets/catalog/spanish/external-qa-adjudications.json` records the three-way
adjudication of the 63 unique A1, A2, and B1 external-reference non-correspondences.
Bucket A is a learner-content defect and carries a correction overlay, bucket B is a
provenance-only semantic exception, and bucket R is a Wiktionary coverage or
sense-granularity miss where the generated definition and selected OMW record agree.
The recorded split is A=10, B=2, R=51. External-reference results must always be
reported with this split; a raw non-correspondence rate is not a content-quality rate.

The same policy applies to the later-level sidecars. The B2 adjudication records
A=4, B=0, R=19, and the C1 adjudication records A=2, B=0, R=21. B2 and C1 add no
semantic exceptions. Their bucket-A overlays were carried into Slovak grouping;
post-correction external QA confirmed both C1 replacements and three of four B2
replacements directly. The remaining B2 item, `biblia`, is an externally recorded
case/coverage miss: its learner-facing repair is capitalization of the example, not
a newly unsupported meaning.

`assets/catalog/spanish/b1-post-translation-content-corrections.json` removes the
US-specific framing left in the initial `hispano` repair. Its existing general Slovak
hint remains applicable, the owner-review queue shows the corrected Spanish text,
and a one-entry post-correction external check confirmed correspondence at sense rank
2. The immutable historical translation run is not rewritten.

`assets/catalog/spanish/course-entry-merges.json` merges the post-normalization A1
`solo`/`sólo` adverb duplicate for course presentation. The unaccented entry survives,
while both ELELex source rows, source forms, OMW aliases, immutable generated records,
and the retired entry ID remain recorded as provenance. The source catalog and ELELex
level assignment are not rewritten.

## Production promotion gate

### ELELex A1 production-review amendment (2026-09-08)

For the frozen ELELex-derived A1 course, the owner approved automated external-reference
QA plus an independent AI cross-review plus explicit owner risk acceptance as the
production review standard for Spanish learner content. This supersedes the qualified
Spanish-reviewer requirement below for that release only. It does not turn either
automated pass into human or native-speaker review. Every generated manifest and
summary remains marked `notHumanReview`, and every product source disclosure must say:

> Spanish definitions are generated and automatically verified against reference
> sources; they have not been reviewed by native Spanish speakers. Slovak hints are
> checked against linked lexical references where available and independently AI
> cross-reviewed; they have not been reviewed by native Slovak speakers. Flagged A1
> hints carry AI-assisted, owner-accepted verdicts. Spanish–Slovak sense correspondence
> has not been verified by a native bilingual reviewer.

Under the narrowed policy, only machine-flagged Slovak rows require owner verdicts.
All 47 flagged A1 concepts have AI-assisted, owner-accepted verdicts; the earlier 35
owner verdicts remain historical metadata only. A2-C1 use a 300-concept probability
sample per level plus all divergence-gate findings, with targeted rows excluded from
the probability denominator unless independently sampled. Their 70 flagged rows remain
unresolved and do not gate A1. A critical-error rate above 2% or a material-error rate
above 5% escalates that later level to a larger sample or complete review. The ELELex
licensing gate and the A1 flagged-row verdict gate are both clear.

The approved A1 asset is promoted to `assets/catalog/spanish/a1-course.json`; its
catalog and source-input hashes are recorded in the adjacent small release manifest.
Neither the Spanish editorial manifest nor the cross-course CEFR catalog manifest is
runtime-imported. Only A1 is bundled.

For B2 and C1, external-reference QA uses one deterministic probability sample per
level plus the complete minority-POS cohort. It does not separately add the
everyday-life cohort because the measured external check produced approximately five
reference misses for every content defect and these levels have the cleanest measured
category and minority-POS indicators. The blinded Astra cross-review remains separate.

An asset may change from `draft` to `production` only when:

1. every source and transformation has a recorded release-compatible license,
   version, checksum, attribution, and redistribution scope;
2. every entry has namespaced unique identity, valid normalized term, CEFR evidence,
   POS, original Spanish definition/example, and Slovak hint;
3. the applicable approved Spanish review standard and Slovak flagged-row verdict
   policy are satisfied;
4. disagreements are adjudicated and recorded rather than silently overwritten;
5. deterministic validation passes and each manifest count matches the entries; and
6. release QA confirms the product labels the catalog CEFR-aligned and displays all
   required attribution.

## Retired 500-entry A1 pilot

The schema-v1, quota-bound 500-entry candidate pipeline and its bespoke local review
server are retired. The 6,185-entry ELELex-derived catalog, schema-v2 lexical evidence,
current learner-content QA, and flagged-row TSV adjudication workflow supersede them.
The retired workflow is historical evidence only and cannot gate or produce a release.
Its decision, retained assets, and deliberately retired quality rules are recorded in
`assets/catalog/spanish/cefr-catalog-manifest.json` under
`retiredEditorialWorkflows.a1QuotaPilot500`.

The 500 candidate records, their correction ledger, the A1 portions of the second
correction ledger, and `SPANISH_A1_IMPLEMENTATION_VERIFICATION.md` remain in place as
historical, non-gating evidence. The old validate, review-server, score, and compile
commands no longer exist. The active schema-v2 `a1-lexical-evidence.json` must not be
passed through the retired schema-v1 validator.

## Active editorial source preparation

Download and extract the pinned `omw-es-2.0.tar.xz` and `omw-en-2.0.tar.xz` releases
outside the repository, then generate the lexical-evidence sidecar while verifying
both sources:

```sh
pnpm spanish:a1:sources --archive <path-to-omw-es-2.0.tar.xz> --omw <path-to-omw-es.xml> --english-archive <path-to-omw-en-2.0.tar.xz> --english-omw <path-to-omw-en.xml>
```

This command validates the active source manifest and both pinned OMW archives before
writing schema-v2 lexical evidence for the selected CEFR level. The current A1 evidence
covers 1,705 entries from the 6,185-entry catalog. Downstream learner-content, quality,
Slovak-hint, correspondence, and staging commands implement the current workflow.

## Original multi-level supplemental drafts (2026-09-05)

The owner-approved expansion has a separate original-content draft lane, documented
in `docs/SPANISH_CATALOG_EXPANSION.md`. It is not part of the retired quota-pilot
review workflow. Supplemental AI assessments bind every entry and exact input hashes;
corrections invalidate coverage and require rechecking. Preview
compilation rejects unresolved, stale or incomplete reports and never emits a
production release. Existing human decisions are not populated from AI records. The
historical preview contains entries across all six levels but is not runtime-imported;
the next 138 enumerated selections and additional unmapped coverage remain unfinished.
