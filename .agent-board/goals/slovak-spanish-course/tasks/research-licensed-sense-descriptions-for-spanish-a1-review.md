---
id: "research-licensed-sense-descriptions-for-spanish-a1-review"
title: "Research licensed sense descriptions for Spanish A1 review"
status: "done"
priority: "high"
assignee: ""
branch: ""
skills: []
specs: ["spanish-a1-500-entry-original-catalog-pilot-specification", "spanish-a1-licensed-semantic-review-references"]
depends_on: []
blocks: ["obtain-and-adjudicate-independent-spanish-a1-reviews"]
blocked_by: []
relates_to: ["spanish-a1-500-entry-original-catalog-pilot-specification", "spanish-a1-licensed-semantic-review-references"]
created: "2026-09-04T11:48:35.485Z"
updated: "2026-09-04T11:59:23.536Z"
verified: ""
verified_sha: ""
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Identify a commercially reusable, attributable, deterministic semantic reference that
lets a qualified Spanish reviewer distinguish the OMW Spanish 2.0 synset choices for
the 469 ambiguous A1 candidates, without reproducing restricted PCIC content.

## Acceptance Criteria

- [x] Confirm what semantic fields exist in the pinned OMW Spanish release.
- [x] Evaluate official Princeton WordNet/Open English WordNet/OMW-linked gloss sources
      for ID compatibility, license, attribution, redistribution, version pinning, and
      deterministic extraction.
- [x] Quantify coverage for the actual offered Spanish synset IDs and document gaps.
- [x] Recommend the minimal source and data-model addition, or record why none is safe.
- [x] Produce a precise follow-up specification for approval; do not implement it.

## Verify

<!-- Research-only task: evidence is recorded in the linked specification. -->

## Evidence

- [research] 2026-09-04: Inspected the pinned OMW Spanish 2.0 XML and all 3,088
  offered rows/2,800 unique synsets. Spanish source definitions cover 696 unique
  offered synsets and fully cover only 3/469 ambiguous records.
- [research] 2026-09-04: Downloaded the official OMW English 2.0, Princeton WordNet
  3.0, and OEWN 2025 releases to temporary storage; verified their archive SHA-256
  values and official license texts/pages. No source archive was committed.
- [research] 2026-09-04: OMW English 2.0 resolves 2,800/2,800 offered Spanish
  synsets with equal ILIs; 192 adjective satellites use the explicit `a` to `s`
  normalization. Princeton WordNet 3.0 also covers all 2,800. OEWN 2025 covers
  2,775 via ILI and only 21 by direct stored offset in the app's current SQLite.
- [spec] Proposed exact implementation and legal-attribution requirements in
  `spanish-a1-licensed-semantic-review-references` without implementation changes.
