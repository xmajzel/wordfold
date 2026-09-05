---
id: "produce-and-validate-the-spanish-a1-c2-catalog-with-slovak-hints"
title: "Produce and validate the Spanish A1-C2 catalog with Slovak hints"
status: "blocked"
priority: "high"
assignee: "root"
branch: ""
skills: []
specs: ["slovak-native-spanish-course-research-and-implementation-specification", "spanish-a1-500-entry-original-catalog-pilot-specification"]
depends_on: ["approve-slovak-native-spanish-course-semantics-and-content-source-path", "build-deterministic-spanish-a1-candidate-and-review-pipeline", "obtain-and-adjudicate-independent-spanish-a1-reviews"]
blocks: ["add-spanish-public-private-and-downloadable-neural-pronunciation-parity"]
blocked_by: ["Requires written bulk-reuse permission or a completed original A1-C2 editorial dataset plus independent Spanish and Slovak reviewer sign-off; neither artifact currently exists.", "PCIC framework permission is recorded. Production remains blocked on creating the original or separately licensed A1-C2 learner-facing dataset and obtaining independent Spanish-content and Slovak-hint reviewer sign-off.", "The original 500-entry A1 draft and review pipeline are complete. Production remains blocked on independent Spanish-content and Slovak-hint review of A1; full A1-C2 completion additionally requires original A2-C2 datasets and their reviews.", "Local preview contains 685 draft entries across all six levels, including 185 independently AI-reviewed expansion senses. Production remains separately gated on truthful human review and release approval. Complete curriculum coverage is unfinished: 138 next selections, further unmapped areas, and individual legacy A1 placement adjudication remain."]
relates_to: ["slovak-native-spanish-course-research-and-implementation-specification"]
created: "2026-08-27T18:04:44.938Z"
updated: "2026-09-05T13:42:52.324Z"
verified: ""
verified_sha: ""
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Produce a legally reusable, deterministic, independently reviewed Spanish A1-C2
catalog with Spanish learner content and Slovak hints, without changing the English
catalog or reusing its identities.

## Acceptance Criteria

- [ ] Editorial rules cover lemmas, gender, reflexive verbs, variants, inflections,
      multiword expressions, homographs, abbreviations, and regional vocabulary.
- [ ] Every source and transformation has an approved commercial-use license,
      attribution, pinned version, checksum, and provenance record.
- [ ] Every entry has a namespaced stable ID, Spanish term, CEFR-aligned level, POS,
      original reviewed Spanish definition/example, reviewed Slovak hint, and review
      metadata.
- [ ] All six CEFR levels exist; level counts are evidence-driven and not copied from
      the English distribution.
- [ ] Catalog lookup is course-aware and cross-language homographs cannot collide.
- [ ] Spanish discovery/topic packs are source-traceable and do not reuse English term
      mappings.
- [ ] Deterministic validators enforce uniqueness, completeness, provenance,
      distributions, translations, and English-regression invariants.
- [ ] Content reviewers sign off under the approved rubric before release.

## Verify

```sh
pnpm test -- src/data src/features/recommendations
pnpm typecheck
pnpm lint
```

## Evidence

- [progress] 2026-08-27T18:34:28.040Z by root: Implementation review confirmed that no approved reusable Cervantes bulk dataset or independent Spanish/Slovak review evidence exists. The production content task remains gated; app/catalog infrastructure will be separated into a foundation task so safe implementation can continue without mislabeling draft content as reviewed.

## Blocker

Requires written bulk-reuse permission or a completed original A1-C2 editorial dataset plus independent Spanish and Slovak reviewer sign-off; neither artifact currently exists.

- [progress] 2026-08-27T21:13:23.457Z by root: Instituto Cervantes framework permission received 2026-08-27 and recorded in redacted form. Commercial use of PCIC levels, categories, and classifications as an acknowledged reference framework is authorized. Production content remains blocked only on creating original/separately licensed learner-facing content and independent Spanish/Slovak review.

## Blocker

PCIC framework permission is recorded. Production remains blocked on creating the original or separately licensed A1-C2 learner-facing dataset and obtaining independent Spanish-content and Slovak-hint reviewer sign-off.

- [progress] 2026-08-27T22:18:27.923Z by root: Completed parallel PCIC-framework and lexical-source research. Proposed a precise draft-only 500-entry A1 pilot spec with 20 Wordfold-authored category quotas, pinned OMW Spanish 2.0 sense evidence, immutable review hashes, distinct Spanish/Slovak review gates, and no runtime exposure before sign-off.

## Blocker

The original 500-entry A1 draft and review pipeline are complete. Production remains blocked on independent Spanish-content and Slovak-hint review of A1; full A1-C2 completion additionally requires original A2-C2 datasets and their reviews.

## Blocker

Local preview contains 685 draft entries across all six levels, including 185 independently AI-reviewed expansion senses. Production remains separately gated on truthful human review and release approval. Complete curriculum coverage is unfinished: 138 next selections, further unmapped areas, and individual legacy A1 placement adjudication remain.
