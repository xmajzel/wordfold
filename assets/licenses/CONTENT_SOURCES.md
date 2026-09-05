# Content sources

## Spanish course status and Instituto Cervantes framework permission

Instituto Cervantes granted Wordfold written permission on 27 August 2026 to use the
Plan Curricular del Instituto Cervantes (PCIC) as a reference framework for developing,
organizing, and classifying original Spanish-learning content across A1-C2 in a
commercial digital language-learning application.

- Reference: https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/indice.htm
- Accessed: 27 August 2026
- Permission evidence: `docs/legal/INSTITUTO_CERVANTES_PCIC_PERMISSION.md`
- Authorized use: PCIC levels, categories, and classifications may structure
  Wordfold's original Spanish curriculum.
- Approved description: “Spanish learning content structured according to the Plan
  Curricular del Instituto Cervantes (PCIC), A1-C2.”
- Bundled PCIC content: none
- Restrictions: protected PCIC materials are not reproduced beyond the permitted
  reference scope; Wordfold does not claim certification, accreditation, endorsement,
  or official validation and does not use the Instituto Cervantes logo as a
  promotional mark.

`assets/catalog/spanish/cefr-pilot.json` contains six original Wordfold draft records
created solely to validate the course-aware catalog schema and level code paths. They
are explicitly excluded from production catalog APIs and recommendations until
independent Spanish and Slovak review is recorded. The editorial and promotion rules
are documented in `docs/SPANISH_CATALOG_EDITORIAL_POLICY.md`.

### Spanish A1 lexical evidence

The original 500-entry Spanish A1 editorial pilot uses the Spanish module from Open
Multilingual Wordnet 2.0 for lemma, part-of-speech, and candidate sense identifiers.
The module packages the Spanish data from Multilingual Central Repository 3.0 release
2016. It does not supply Wordfold's level decisions, learner definitions, examples, or
Slovak hints.

- Source release: https://github.com/omwn/omw-data/releases/tag/v2.0
- Pinned asset: `omw-es-2.0.tar.xz`
- SHA-256: `d8450d42885cd51f3db39fe64219a7a003eeb432b4caa00428285fe6ab224303`
- License: Creative Commons Attribution 3.0 Unported (CC BY 3.0)
- Attribution: Multilingual Central Repository 3.0 (release 2016), González-Agirre,
  Laparra and Rigau (2012), packaged by Open Multilingual Wordnet 2.0
- Transformations: Spanish lemmas, POS, lexical-entry/sense/synset IDs, ILIs, and
  available Spanish source definitions/examples are extracted. Duplicate sense rows
  for the same synset are grouped with aliases retained. Source descriptions are
  review evidence, not learner content.

The separately licensed English module from the MCR package is not ingested. Every
Spanish definition and example and every Slovak hint in the pilot is original draft
Wordfold content and remains excluded from runtime APIs until independent Spanish and
Slovak review is complete.

### WordNet 3.0 semantic references for Spanish review

The Spanish review workspace uses the `omw-en:2.0` module required by the pinned
Spanish OMW release to explain candidate source meanings. This is a separate source
from the Open English WordNet 2025 database used by the English course.

- Release: https://github.com/omwn/omw-data/releases/tag/v2.0
- Pinned asset: `omw-en-2.0.tar.xz`
- SHA-256: `0e09dfb7f096bc3f10b9de68ffecf13839fa22ae46fd9b227cec890d204ca1dc`
- License: WordNet 3.0; the complete notice and disclaimer accompany the extracted
  references in `assets/licenses/WORDNET_3_0_LICENSE.txt`.
- Attribution: WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.
- Transformations: map the Spanish synset offset/POS to English, allowing only
  adjective `a` to satellite `s` fallback and requiring equal ILIs; extract English
  definitions, member lemmas and examples verbatim for editorial review.

Preserve the complete license, copyright notice and disclaimer on all copies,
including modified/internal copies. The license prohibits using the Princeton name
in advertising or publicity pertaining to distribution. Review reference text stays
outside Wordfold learner definitions, examples, hints, and runtime catalogs.

Google Books Ngram Spanish corpus `googlebooks-spa-20200217` may be used as an optional
aggregate ranking signal over the 2000-2019 window. It never determines a CEFR level or
sense, and raw n-gram rows are not bundled.

## Open English WordNet 2025

Definitions, examples, parts of speech, and sense data are adapted from Open English WordNet 2025 by the Global WordNet Association.

- Source: https://github.com/globalwordnet/english-wordnet
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/

Open English WordNet definitions, examples, parts of speech, and sense identifiers are also used in the generated CEFR-aligned catalog.

## CEFR-J Wordlist 1.6

The A1–B2 headwords and source parts of speech are adapted from the CEFR-J Wordlist Version 1.6, compiled by Yukio Tono at Tokyo University of Foreign Studies.

- Source: https://www.cefr-j.org/download.html
- Terms: research, educational, and commercial use and creation of modified wordlists are permitted with proper acknowledgement of the source; see the source workbook and download page
- Required acknowledgement: The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from https://www.cefr-j.org/download.html on 16 July 2026.

Changes made by Wordfold: slash-separated spelling variants are expanded, a single lowest level is selected where one normalized headword has multiple CEFR-J levels, entries are matched to a compatible Open English WordNet part of speech and sense, and entries without a compatible sense are excluded. The original source rows and all transformations are retained in the source CSV and QA manifest.

## Octanove Vocabulary Profile C1/C2 1.0

The C1–C2 headwords and source parts of speech are adapted from the Octanove Vocabulary Profile C1/C2 Version 1.0, created by Octanove Labs and published through Open Language Profiles.

- Source: https://github.com/openlanguageprofiles/olp-en-cefrj
- License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- License text: https://creativecommons.org/licenses/by-sa/4.0/

Changes made by Wordfold: duplicate source rows are collapsed, unresolved C1/C2 level conflicts are excluded, one documented `vern` to `verb` source typo is corrected, lower CEFR-J levels take precedence over overlapping C1/C2 terms, and remaining entries are matched to compatible Open English WordNet senses. Octanove-derived catalog entries remain available under CC BY-SA 4.0.

## Generated CEFR-aligned catalog

`assets/catalog/cefr-catalog.json` is generated from the two level sources above and Open English WordNet. It is CEFR-aligned; it is not an official vocabulary list published by the Council of Europe.

The exact source rows are in `assets/catalog/sources/`. `assets/catalog/cefr-catalog-manifest.json` records source versions, entry provenance, conflicts, exclusions, transformations, counts, and validation results.

### Learner-friendly English definitions

`assets/catalog/cefr-learner-definitions.json` is a generated presentation overlay. Codex selects one
meaning from the compatible Open English WordNet senses using the committed source part of speech,
CEFR level, and any source context, then rewrites that meaning in concise learner-friendly English
and supplies an example sentence. Generation is restricted to the committed repository evidence;
it does not search or copy definitions from other dictionaries.

Each overlay record retains its selected WordNet meaning-reference ID, confidence, and review state.
The base catalog entry and pronunciation identity remain unchanged for compatibility and rollback.
Records that still need review are not applied at runtime.

Every originally review-gated English record is resolved in
`assets/catalog/cefr-learner-definition-adjudications.json`. WordNet-backed adjudications retain the
supporting sense ID; curated meanings use a null reference instead of falsely attributing an absent
meaning to WordNet.

### Bundled English-to-Slovak hints

Each generated CEFR entry includes an offline Slovak hint produced once from its English headword, part of speech, and Open English WordNet sense definition. Generation uses the pinned int8 CTranslate2 conversion of MADLAD-400-3B-MT. If the generated headword is copied, misspelled, or otherwise unsafe, Wordfold stores the translated sense explanation as the hint instead. Catalog-specific corrections can be recorded in `assets/catalog/cefr-translations-en-sk-overrides.json`.

- Model: `cstr/madlad400-3b-ct2-int8`
- Pinned revision: `fd0b55729c074372eb84b52b9309a00dc65c40c4`
- Upstream model: `google/madlad400-3b-mt`
- Source: https://huggingface.co/cstr/madlad400-3b-ct2-int8
- License: Apache License 2.0
- License text: https://www.apache.org/licenses/LICENSE-2.0

The committed translation sidecar records the model revision, generation parameters, content hash, fallback decisions, overrides, and QA totals. These generated hints are learning aids and may still need native-speaker corrections; the overrides file is the durable correction layer.

`assets/catalog/cefr-learner-translations-sk.json` is the final presentation overlay aligned to the
reviewed learner meaning, example, and part of speech. It was generated and independently reviewed
with Codex using only committed catalog evidence. Existing MADLAD hints and manual overrides were
treated as comparison evidence, not authoritative output. The base translation data remains intact
for identity compatibility and rollback.

## NGSL discovery packs

The optional Spoken, Business, and Academic word lists are adapted from work by Charles Browne, Brent Culligan, and Joseph Phillips through the New General Service List Project.

- Source: https://www.newgeneralservicelist.org/
- License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- License text: https://creativecommons.org/licenses/by-sa/4.0/

Changes made by Wordfold: the source lists are converted to JSON, associated with Open English WordNet senses, and filtered against words already in the user's library.

## Publisher vocabulary sources not included

No Oxford, Cambridge, British Council, Headway, or other publisher vocabulary list has been copied or scraped. The implementation plan to follow only after written permission is recorded in `docs/FUTURE_PUBLISHER_VOCABULARY_PLAN.md`.

## Wordfold curated senses

The short project and business definitions in `assets/catalog/curated-senses.json` are original Wordfold content. They are ranked ahead of dictionary senses where a modern work-related meaning is more useful to this app's starter audience.

## Original Spanish supplemental curriculum

`assets/catalog/spanish/expansion-candidates.json` contains 185 independently
AI-authored Wordfold senses selected against the PCIC/CEFR reference framework,
with original Spanish definitions/examples and Slovak hints. No PCIC learner-facing
prose or bulk publisher word list is reproduced. The per-sense framework references,
provisional placements, objective coverage and gaps are in `a1-c2-inventory.json`.

The learner preview in `expansion-preview.json` contains only original learner
fields and audit hashes; licensed OMW/WordNet reviewer glosses are not included.
Both independent AI assessments and their prior revisions are retained under
`assets/catalog/spanish/reviews/`. These assessments are not native attestations,
certification, endorsement or production-release approval. See
`docs/SPANISH_CATALOG_EXPANSION.md` for the separate draft and release workflows.
