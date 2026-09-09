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
the applicable Spanish automated-QA and Slovak owner-review gates are recorded. The
Spanish checks are not human or native-speaker review. The editorial and promotion
rules are documented in `docs/SPANISH_CATALOG_EDITORIAL_POLICY.md`.

### ELELex Spanish CEFR level source

Spanish headwords, parts of speech, and CEFR level assignments are adapted from ELELex,
a CEFR-graded lexical resource developed as part of the CEFRLex project at
UCLouvain/CENTAL.

- Project: https://cental.uclouvain.be/cefrlex/
- Pinned asset: `assets/catalog/sources/elelex-freeling-2020-12-04.tsv`
- Download URL: https://cental.uclouvain.be/cefrlex/static/resources/es/ELELex.tsv
- Revision: server `Last-Modified` 4 December 2020 09:48:08 GMT; ETag
  `1607075288.0-1442791-870521007`; retrieved 6 September 2026
- SHA-256: `87a28dc6d3c5c2344883698f7bc77e259bd42212446ac2b52761a3fc8f5f26cf`
- Published license: Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International (CC BY-NC-SA 4.0)
- Commercial authorization: UCLouvain/CENTAL granted Wordfold written permission on
  6 September 2026 to use and integrate ELELex lexical entries, CEFR-level information,
  and associated frequency data within its commercial language-learning application,
  and to process, transform, and integrate that data into Wordfold's own database. The
  authorization supersedes the NonCommercial restriction of CC BY-NC-SA 4.0 for these
  uses. Evidence: `docs/legal/UCLOUVAIN_ELELEX_PERMISSION.md`
- Required acknowledgement: “Spanish vocabulary level data is based in part on ELELex,
  a CEFR-graded lexical resource developed as part of the CEFRLex project at
  UCLouvain/CENTAL.”
- Level coverage: A1-C1. ELELex does not publish a C2 column, so the first Spanish
  release is scoped to A1-C1 and C2 is gated as not yet available. No C2 entries are
  synthesized from the C1 tail.
- Unresolved: see the paired ShareAlike legal-review items below.
- Restrictions: the authorization does not imply endorsement, certification, or
  validation of Wordfold by UCLouvain.

### ShareAlike items for legal review

Review these two items together whenever the Spanish course licensing posture receives
legal review:

1. **ELELex:** UCLouvain/CENTAL's written authorization expressly supersedes the
   NonCommercial restriction but does not address the CC BY-NC-SA 4.0 ShareAlike term.
   Clarification has been requested. Until a written answer is recorded, the
   ShareAlike obligation for Wordfold's derived Spanish catalog remains unresolved.
2. **Spanish Wiktionary QA reference:** a pinned Kaikki/Wiktextract extraction of
   Spanish Wiktionary is read only for internal QA under Wiktionary's CC BY-SA 4.0 / GFDL
   terms. The raw archive and extracted sense text remain in ignored `.artifacts`, are
   never bundled, and are not used to generate or adapt learner content. Reports retain
   verdicts, ranks, source revisions, and hashes but no Wiktionary glosses. This
   QA-only, attribution-preserving separation is Wordfold's current cautious posture,
   not a legal conclusion about ShareAlike; it must be reviewed alongside the ELELex
   question.

Changes made by Wordfold: the pinned ELELex distribution is verified by SHA-256, lemmas
are NFKC-normalized and lowercased for Spanish, FreeLing parts of speech are mapped to
the WordNet noun/verb/adjective/adverb categories, and entries are joined to Open
Multilingual Wordnet Spanish on normalized lemma plus compatible part of speech. Entries
without a compatible OMW sense are excluded from the frozen membership. ELELex's
document counts are aggregated independently at each level for each normalized lemma
and mapped part of speech. An entry is attested when an aggregate reaches two documents,
and is assigned the first A1-C1 level that does so. Entries that never reach two
documents remain in the frozen membership as unattested, have no assigned level, and
are excluded from courses and learner-content generation without a fallback level.
Source-native FreeLing `NP0` and `NP*` proper names and nonlexical term shapes are also
retained frozen but excluded from courses. A targeted audit of title-cased OMW lemmas
and WordNet named instances excludes six additional person/place-name misses while
retaining useful common homographs. The approved modern headwords `solo` and `guion`
replace source spellings `sólo` and `guión` only after the source-form OMW join; stable
membership IDs, original source forms and rows, and all OMW senses remain recorded.
Attested multiword lexical units are included unless another course filter applies; no
multi-POS filter is used. This replaces ELELex's single-document first-occurrence
interpretation without model scoring, external evidence, or frequency re-ranking.
Evidence tiers, the threshold rule, first-occurrence comparison, course filters, source
rows, orthography rules, revision, hashes, counts, and every exclusion are retained in
the Spanish source manifest.

Regional variants are temporarily retained as independent entries with their unchanged
ELELex-derived levels. Entries whose selected OMW senses resolve to the same WordNet
synset/ILI may be grouped at the sense level without an external regional source: there
is no global canonical entry, the course teaches the shared concept once, and every
member form remains available for recognition and search. This grouping also covers
ordinary synonym clusters and is approved for the translation/presentation stage.
Only regional labelling and locale-preferred primary-form selection remain deferred
pending a licensed regional source; GEOLEXI and Wiktionary/Wiktextract are not used for
catalog membership, CEFR level, sense selection, regional labels, or learner-content
generation. The later QA-only use of Wiktionary/Wiktextract is described below.

### Spanish A1 lexical evidence

The ELELex-derived Spanish A1 course catalog uses the Spanish module from Open
Multilingual Wordnet 2.0 for lemma, part-of-speech, and candidate sense identifiers.
The module packages the Spanish data from Multilingual Central Repository 3.0 release
2016. It does not determine Wordfold's catalog membership or CEFR levels and does not
supply Wordfold's learner definitions, examples, or Slovak hints. PCIC classifications,
when present, are metadata only and do not affect membership, level, or sense selection.

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

The separately licensed English module from the MCR package is ingested only to bridge
each supplied Spanish OMW sense to its WordNet 3.0 English synset as generation and
review evidence. Every Spanish definition and example and every Slovak hint in the
pilot is original draft Wordfold content and remains excluded from runtime APIs until
the applicable validation and review gates are complete.

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

### Spanish A1 automated quality checks

The immutable 1,707-entry A1 learner-content run (content SHA-256
`5383a7a98cd218c707c850bdf88f20b943522c0782f4389418acc6cb304f3f1a`) received two
independent automated checks. Every manifest and summary is marked `notHumanReview`.
There was no native-Spanish review, and neither check may be described as one.

- **External-reference validity sample:** 300 entries were selected reproducibly and
  proportionally from the 353 Spanish-gloss and 1,354 English-bridge-only strata (62 and
  238 respectively). Against the Spanish Wiktionary extraction dated 1 September 2026,
  reference coverage was 294/300 (98%). There were 293 definitive outcomes: 10/300
  definitions were strict non-correspondences, 283/293 definitive judgments
  corresponded, and 7 were uncertain (including 6 without a compatible reference
  entry). Among the 283 valid correspondences, the source sense index had median 1,
  p90 3, p95 4, and maximum 9;
  the within-part-of-speech rank had median 1, p90 2, p95 4, and maximum 9. High rank is
  only a suspicion because Wiktionary ordering is editorial rather than corpus-based.
  This check measures whether a definition expresses a listed real Spanish sense, not
  whether it is the right sense to teach at A1, and is not an overall quality rate.
- **Blinded AI cross-review:** `gpt-6-astra` independently reviewed the existing
  200-item packet without OMW glosses, selected senses, generation confidence, flags,
  or adjudications. Content disagreement was 15/200 (7.5%): 0 wrong-sense verdicts,
  14 material-definition disagreements, and 1 material-example disagreement. Level
  disagreement was separately 82/200 (41%). Dimensions overlap. This is an AI
  cross-review disagreement rate, not a measured error rate.

### Spanish A2 automated quality checks

The immutable 1,847-entry A2 learner-content run (content SHA-256
`25da85d0a9942771fbab766f4aa47470b6e1a910a21fbd05956d25077e9a23b4`) is also
marked `notHumanReview`. A deterministic WordNet-hypernym classifier identified 98
A2 entries in the food, clothing, sport, and leisure risk domains. This deliberately
targeted cohort is not a probability sample: Wiktionary covered 93/98 entries, and 9/98
were strict non-correspondences. The same classifier applied to A1 found 109 entries;
coverage was 109/109 and 2/109 (1.83%) were strict non-correspondences. A2's 9.18% is
7.35 percentage points, or 5.00 times, higher in this like-for-like targeted comparison.
Neither result is a level-wide quality rate.

A separate blinded 200-entry `gpt-6-astra` cross-review found content disagreement in
23/200 entries (11.5%): 4 wrong-sense verdicts, 19 material-definition disagreements,
and 7 material-example disagreements. Level disagreement was separately 57/200 (28.5%).
Dimensions overlap. Compared with A1, the observed content-disagreement rate increased
by 4 percentage points, or 53% relative; the intervals overlap, so this is not presented
as a statistically significant difference. This is an AI cross-review disagreement
rate, not a measured error rate. The model's level judgments do not alter any ELELex
assignment.

ELELex minority-POS targeting evaluates 6,171 single-word catalog entries. There are
257 distinct source lemma/POS risks below 50%, expanding to 258 catalog entries because
the independently generated `solo` and normalized `sólo` A1 adverbs share one display
lemma/POS. The entry counts are A1 63, A2 96, B1 55, B2 23, and C1 21; 155 are below
25% and 69 below 10%. In the complete A1/A2 targeted cohorts, external-reference
coverage was 60/63 and 83/96, with strict non-correspondence of 5/63 (7.94%) and 17/96
(17.71%). Blinded AI content disagreement was 9/63 (14.29%) and 16/96 (16.67%); level
disagreement was separately 24/63 and 32/96. These risk-cohort findings are excluded
from probability-sample denominators.

The Slovak translation packet was not part of either check. Slovak translations use
level-specific owner review: all A1 concepts require a verdict from Wordfold's
native-Slovak-speaking owner; A2-C1 use a reproducible probability sample plus
separately reported targeted findings. The probability-sample gates are at most 2%
critical error and at most 5% material error. Crossing either bound escalates the level
to a larger sample or full review. Targeted findings are excluded from those denominators.
The Slovak owner-disagreement baseline comes from the full A1 review and remains pending;
the 3.33% A1 Spanish external-reference non-correspondence rate is a different metric.

Any product summary of Slovak review coverage must preserve the level distinction:

> A1 Slovak hints reviewed by a native speaker; A2-C1 sampled.

For the frozen ELELex-derived Spanish course levels, the owner approved automated
external-reference QA plus independent AI cross-review plus explicit owner risk acceptance as the
Spanish production-review standard on 8 September 2026. Neither pass is human or
native-speaker review. Product source disclosures must include this exact line:

> Definitions are generated and automatically verified against reference sources.
> They have not been reviewed by native speakers.

This review-policy decision does not clear the unresolved ELELex ShareAlike question.
No distributable Spanish course artifact may be compiled or bundled until that legal
blocker is resolved.

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
