---
id: "spanish-a1-licensed-semantic-review-references"
title: "Spanish A1 licensed semantic review references"
status: "approved"
category: "content"
created: "2026-09-04T11:57:18.963Z"
updated: "2026-09-04T11:57:18.963Z"
---

## Context

The Spanish A1 review interface currently presents only opaque OMW sense and synset
identifiers. A native Spanish reviewer cannot responsibly distinguish the 469
polysemous candidates from identifiers such as `omw-es-cabeza-01318381-n` alone.
The existing candidate definition and example express Wordfold's intended meaning,
but the reviewer also needs a licensed description of each offered source sense to
verify that the selected OMW identity actually matches that meaning.

This specification proposes review-support evidence only. It does not replace any
original Wordfold learner definition or example, make a semantic selection, count as
human review, or publish catalog content.

## Research evidence (2026-09-04)

### Existing repository and pinned-source facts

- `assets/catalog/spanish/a1-lexical-evidence.json` contains 497 exact Spanish
  lemma/POS matches, 469 records with multiple offered senses, 28 single-sense
  records, and 3 original-editorial exceptions. It contains 3,088 offered rows
  representing 2,800 unique OMW synsets.
- `scripts/prepare-spanish-a1-sources.mjs` currently extracts only Spanish lemma,
  POS, lexical-entry ID, sense ID, and synset ID. It ignores the Synset section.
- The pinned `omw-es:2.0` XML declares `<Requires ref="omw-en" version="2.0" />`.
  Its Synset records include an ID, ILI, POS, members, and optional Spanish
  `Definition` and `Example` fields.
- Across the complete pinned Spanish module there are 78,948 synsets, all with an
  ILI, 19,444 with a definition, and 1,105 with at least one example.
- For the 2,800 synsets actually offered to A1 reviewers, the Spanish module has a
  definition for 696 (24.86%) and an example for 91. It fully describes all choices
  for only 3 of the 469 ambiguous candidate records, partially describes 315, and
  describes none of the choices for 151. The Spanish module is therefore useful
  supplementary evidence but cannot solve the review problem alone.
- The app's committed `assets/catalog/wordnet.sqlite` was built from Open English
  WordNet 2025. Its stored IDs are OEWN/PWN 3.1-style offsets and it does not retain
  ILIs. Only 21 of the 2,800 offered OMW/PWN 3.0 offsets match directly, so this
  existing runtime database is not a safe lookup source for these IDs.

### Evaluated sources

| Source | License and redistribution | Mapping to the 2,800 offered synsets | Result |
| --- | --- | --- | --- |
| OMW Spanish 2.0 | Spanish MCR data is CC BY 3.0; already pinned and attributed | Direct ID, but only 696 definitions | Supplement only |
| OMW English 2.0 (`omw-en:2.0`) | Princeton WordNet 3.0 license; commercial use, copying, modification, and distribution are allowed if the full copyright/license/disclaimer statements accompany copies; Princeton's name may not be used in advertising | 2,800/2,800 direct offset/POS mappings and 2,800/2,800 equal ILIs; 192 adjective IDs require the defined `a` to satellite `s` suffix normalization | Recommended authoritative fallback |
| Princeton WordNet 3.0 archive | Same WordNet 3.0 license | 2,800/2,800 by eight-digit synset offset and POS | Compatible, but its WNDB parser is less direct than the OMW-LMF module explicitly required by `omw-es:2.0` |
| Open English WordNet 2025 | CC BY 4.0 permits commercial reuse and redistribution with attribution and change notices | Direct offset mapping covers only 21/2,800. ILI mapping covers 2,775/2,800, leaving 25 gaps; 443/469 ambiguous records are complete and 26 are partial | Not sufficient and adds a version-mapping layer |

The recommended OMW English mapping also resolves a non-empty definition and all
6,713 referenced English member lemmas for every one of the 2,800 unique offered
synsets. After the six repeated same-synset rows are grouped, definition plus source
examples is distinct across every option set for all 469 ambiguous candidates.

The exact reviewed downloads and measured SHA-256 values were:

- `https://github.com/omwn/omw-data/releases/download/v2.0/omw-es-2.0.tar.xz`
  — `d8450d42885cd51f3db39fe64219a7a003eeb432b4caa00428285fe6ab224303`.
- `https://github.com/omwn/omw-data/releases/download/v2.0/omw-en-2.0.tar.xz`
  — `0e09dfb7f096bc3f10b9de68ffecf13839fa22ae46fd9b227cec890d204ca1dc`.
- `https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz`
  — `640db279c949a88f61f851dd54ebbb22d003f8b90b85267042ef85a3781d3a52`.
- `https://en-word.net/static/english-wordnet-2025-json.zip`
  — `7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`.

Primary references:

- OMW 2.0 release and format: `https://github.com/omwn/omw-data/releases/tag/v2.0`
- OMW packaging/namespace notes: `https://github.com/omwn/omw-data/blob/main/README.md`
- Princeton commercial-use terms: `https://wordnet.princeton.edu/license-and-commercial-use`
- Princeton database offsets: `https://wordnet.princeton.edu/documentation/wndb5wn`
- Princeton gloss semantics: `https://wordnet.princeton.edu/documentation/wngloss7wn`
- OEWN 2025 release: `https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition`
- OEWN license: `https://github.com/globalwordnet/english-wordnet/blob/2025-edition/LICENSE.md`

## Decisions

1. Pin `omw-en:2.0` as the mandatory English semantic-description source because it
   is the exact English module required by the pinned Spanish release and provides
   complete, version-compatible coverage.
2. Continue using any Spanish `Definition` and `Example` present in `omw-es:2.0` as
   the preferred reviewer-facing description. Show the English WordNet definition,
   synset members, and examples as the authoritative complete fallback and label the
   language/source explicitly. Do not translate or paraphrase source glosses by
   machine; an unreviewed translation would create a new semantic failure mode.
3. Extend the existing lexical-evidence sidecar rather than add another independent
   artifact. This keeps each option, its source identity, and its descriptions under
   the existing lexical-evidence hash already embedded in Spanish review packages.
4. Resolve each Spanish synset deterministically:
   - strip `omw-es-` from `omw-es-XXXXXXXX-p`;
   - look up `omw-en-XXXXXXXX-p`;
   - only when `p` is `a` and no exact record exists, look up
     `omw-en-XXXXXXXX-s` for an adjective satellite;
   - require the Spanish and English records to have the same non-empty ILI;
   - fail generation on every missing record, ILI mismatch, or unexpected POS.
5. Present one radio option per unique Spanish synset, not per duplicate Spanish
   lexical-entry sense. Five current candidates contain repeated synset choices;
   grouping removes six redundant rows. Preserve every original sense/lexical-entry
   ID in `sourceSenseAliases` and submit the first source-order sense ID as the
   deterministic canonical value accepted by the existing compiler.
6. Preserve the source text verbatim as reviewer evidence and keep it out of
   learner-facing fields. After grouping duplicate synsets, definitions alone are
   distinct for 466/469 ambiguous candidates; definition plus examples distinguishes
   all 469. Synset members remain visible as an additional cue.
7. Add the complete WordNet 3.0 license text to the distributable license materials,
   preserve `WordNet 3.0 Copyright 2006 by Princeton University. All rights
   reserved.`, the disclaimer, and the no-advertising restriction. Describe the
   source factually; do not imply Princeton endorsement. Princeton itself recommends
   counsel review for commercial use, so final legal approval remains a release
   owner responsibility.
8. Refresh the two ignored local review packages only after asserting all 500
   decisions are still `pending` and neither package is finalized. Preserve the
   registered reviewer IDs and qualifications, replace immutable subjects/hashes,
   and leave attestations and completion dates blank. Refuse an automatic refresh if
   any human decision exists.

## Expected behavior

- Source preparation requires both pinned OMW archives/XML files, verifies both
  archive hashes, and enriches every offered OMW choice deterministically.
- Validation refuses partial coverage, missing/blank descriptions, ILI mismatches,
  invalid adjective-satellite normalization, duplicate presented synsets, stale
  hashes, or incomplete WordNet license/provenance metadata.
- The Spanish review page shows, for each unique offered choice: the Spanish synset
  ID, ILI, optional licensed Spanish definition/examples, mandatory English WordNet
  definition, English synset members/examples, and a clear source-language label.
- Selecting a grouped option records its canonical original Spanish OMW sense ID, so
  the existing compilation model remains compatible.
- The Slovak review page receives no English/Spanish source-sense descriptions and
  remains independent.
- Production compilation still depends only on the approved chosen OMW sense and
  original Wordfold learner content; review-support glosses are not copied into the
  promotion candidate.

## Data model changes

Add `omw-en:2.0` to `a1-source-manifest.json` with version, URL, archive SHA-256,
WordNet 3.0 license, exact copyright notice, attribution, redistribution obligations,
and extraction transformations.

Each object in `candidateSenses` gains a hash-bound `semanticReference`:

```json
{
  "spanishSynsetId": "omw-es-01318381-n",
  "englishSynsetId": "omw-en-01318381-n",
  "iliId": "i42274",
  "spanish": {
    "definition": null,
    "examples": []
  },
  "english": {
    "definition": "...",
    "members": ["..."],
    "examples": ["..."]
  },
  "sourceSenseAliases": [
    {
      "senseId": "omw-es-cabeza-01318381-n",
      "lexicalEntryId": "omw-es-cabeza-n"
    }
  ]
}
```

`spanish.definition` is a string or `null`; the arrays may be empty. The English
definition and members are mandatory. The semantic reference is review evidence,
not learner content and not a separately selectable sense identity.

## CLI/input/output changes

- `spanish:a1:sources` adds required `--english-archive` and `--english-omw` inputs.
- Its existing output path remains
  `assets/catalog/spanish/a1-lexical-evidence.json`; no new runtime API is added.
- Review preparation/refresh preserves reviewer metadata only for untouched pending
  packages and rewrites their lexical-evidence hash and immutable Spanish subjects.
- `spanish:a1:validate`, `spanish:a1:score`, and `spanish:a1:compile` validate the new
  source and semantic-reference shape through their existing inputs.
- The loopback review server's public session shape changes only inside each Spanish
  subject's existing `lexicalEvidence.candidateSenses` objects.

## Files/modules likely to change after approval

- `assets/catalog/spanish/a1-source-manifest.json`
- `assets/catalog/spanish/a1-lexical-evidence.json`
- `assets/licenses/CONTENT_SOURCES.md`
- a committed full WordNet 3.0 license file under `assets/licenses/`
- `scripts/prepare-spanish-a1-sources.mjs`
- `scripts/spanish-a1-pipeline.mjs`
- `scripts/spanish-a1-review/app.js` and focused styles only if needed
- focused tests under `src/features/content/`
- `docs/SPANISH_CATALOG_EDITORIAL_POLICY.md` and the local review command examples
- the two ignored `.artifacts/spanish-a1/reviews/*.json` files through the guarded
  pending-only refresh; reviewer IDs/qualifications are preserved

No database migration is required.

## Edge cases

- OMW English represents adjective satellites with `s`, while Spanish uses `a`.
  Only the exact offset-preserving `a` to `s` fallback is allowed, and equal ILI is
  mandatory.
- Several Spanish lexical-entry senses can point to the same synset. They must be one
  visual/semantic option while retaining all aliases for provenance.
- Some different synsets share an identical short English definition. Members and
  examples must be displayed; the measured definition-plus-example signature is
  unique for all current grouped ambiguous choices.
- Source examples may be absent. Absence is valid when the mandatory definition and
  members exist.
- Spanish glosses are sparse and must never hide the complete English fallback.
- Unicode/XML entities must decode deterministically without network DTD resolution.
- Any archive, candidate, evidence, or review hash change makes stale evidence fail
  closed.

## Risks and assumptions

- Most complete source descriptions are English. Confirm the registered Spanish
  reviewer is comfortable using English reference glosses; otherwise obtain a
  separately reviewed/licensed Spanish semantic layer rather than silently machine
  translating them.
- WordNet descriptions are lexicographic evidence, not CEFR grading and not learner
  copy. Human review remains responsible for neutral Spanish usage, A1 placement,
  definition quality, and example quality.
- The WordNet license is permissive but not a standard SPDX license and requires its
  statements on copies. This specification is technical research, not legal advice.
- The coverage counts are bound to the current 500-candidate payload and current
  lexical-evidence hash; later candidate changes require recalculation.

## Explicitly unchanged

- No reviewer decision, attestation, or completion date is authored by automation.
- No candidate term, Wordfold definition, Wordfold example, Slovak hint, PCIC
  classification, or CEFR level changes.
- No candidate becomes visible through runtime catalog APIs.
- No production catalog, database, backend, sync schema, pronunciation behavior,
  native build, EAS build, deployment, English course data, or app navigation changes.
- Open English WordNet 2025 and the existing `wordnet.sqlite` remain unchanged.

## Minimal acceptance criteria

1. Both OMW 2.0 archives are version- and SHA-pinned; the complete WordNet 3.0
   license obligations and attribution are distributed with the extracted evidence.
2. All 2,800 unique offered Spanish synsets resolve to an OMW English synset with an
   equal ILI; all 192 measured adjective-satellite normalizations are explicit.
3. Every unique reviewer option has a non-empty English definition and members;
   optional Spanish glosses are included when present without pretending they are
   complete.
4. The five duplicated candidate records present unique synsets and retain all six
   removed rows as source-sense aliases; definition plus examples distinguishes all
   469 grouped ambiguous records.
5. Spanish review UI and server tests prove source text is visible, escaped as text,
   hash-bound, isolated from Slovak review, and maps a choice to an accepted canonical
   Spanish sense ID.
6. Review-package refresh preserves registered identities only when every decision is
   pending and refuses to overwrite any human work.
7. Existing validation, compilation refusal, runtime catalog exclusion, focused
   tests, TypeScript, lint, and `git diff --check` remain green.

## Tasks

1. Obtain product-owner approval for this proposed specification.
2. Pin/extract `omw-en:2.0`, enrich and validate the lexical-evidence sidecar, and add
   required license/attribution materials.
3. Render grouped semantic references in the Spanish-only review interface and cover
   the behavior with focused tests.
4. Guardedly refresh the still-pending review packages, preserve reviewer identity,
   re-score, and hand the Spanish package to the human reviewer.
