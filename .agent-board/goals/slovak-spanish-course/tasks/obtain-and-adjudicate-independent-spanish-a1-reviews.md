---
id: "obtain-and-adjudicate-independent-spanish-a1-reviews"
title: "Obtain and adjudicate independent Spanish A1 reviews"
status: "blocked"
priority: "high"
assignee: ""
branch: ""
skills: []
specs: ["spanish-a1-500-entry-original-catalog-pilot-specification"]
depends_on: ["build-local-spanish-a1-independent-review-interface", "fix-spanish-a1-review-data-loss-and-cross-process-conflicts", "research-licensed-sense-descriptions-for-spanish-a1-review"]
blocks: ["produce-and-validate-the-spanish-a1-c2-catalog-with-slovak-hints"]
blocked_by: ["Readable semantic references and approved AI corrections are implemented. Both registered humans must complete their independent reviews of the corrected payload, including entry-specific A1 placement; no human decisions or attestations have been recorded."]
relates_to: ["spanish-a1-500-entry-original-catalog-pilot-specification"]
created: "2026-09-04T11:23:58.705Z"
updated: "2026-09-04T12:01:20.444Z"
verified: ""
verified_sha: ""
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Obtain independent, complete human review of the immutable 500-entry Spanish A1
candidate payload from the registered native Spanish and native Slovak reviewers,
then adjudicate any requested changes before a later production-promotion task.

## Acceptance Criteria

- [x] Register distinct reviewer IDs and stated qualifications in separate review packages.
- [ ] `annamariea-es` independently reviews all Spanish subjects, selects an offered
      OMW sense or approves the documented editorial exception, and supplies a truthful
      attestation and completion date.
- [ ] `jozef-sk` independently reviews all Slovak hints for the exact candidate senses
      and supplies a truthful attestation and completion date.
- [ ] Every requested change or rejection has reviewer notes and is adjudicated.
- [ ] Both review files remain bound to candidate SHA-256
      `a50d66a91a8291378bf7706465ef30e6b8baadabd72385356b7a772bbbc84b0b`.
- [ ] Review scoring reports 500 Spanish approvals, 500 Slovak approvals, no pending,
      rejected, or unresolved decisions, and distinct reviewers.
- [ ] Compilation produces only a reviewed draft promotion candidate; production
      exposure remains a separate approved task.

## Verify

```sh
pnpm spanish:a1:score --sources assets/catalog/spanish/a1-source-manifest.json --candidates assets/catalog/spanish/a1-candidates.json --evidence assets/catalog/spanish/a1-lexical-evidence.json --spanish-review .artifacts/spanish-a1/reviews/spanish-review.json --slovak-review .artifacts/spanish-a1/reviews/slovak-review.json
pnpm test -- src/features/content/spanish-a1-pipeline.test.js src/features/content/spanish-a1-source-preparation.test.js src/features/content/spanish-a1-assets.test.js src/data/course-catalog.test.ts
```

## Evidence

- [progress] 2026-09-04 by root: Registered `annamariea-es` as a native Spanish
  speaker and `jozef-sk` as a native Slovak speaker in separate ignored local review
  packages. Validation reports 500 pending decisions per reviewer and confirms that
  reviewer IDs are distinct. Attestations and completion dates remain blank for the
  reviewers to complete truthfully.

## Blocker

The two registered human reviewers must independently complete their 500 decisions.
Automated agents cannot provide or impersonate this sign-off.

- [progress] 2026-09-04T12:01:20.416Z by root: Local review UI and conflict/data-loss hardening are complete. Slovak hint review can proceed. Spanish review must wait for the proposed licensed semantic-reference enrichment because the current OMW package exposes opaque IDs for 469 ambiguous candidates.

## Blocker

The semantic-reference blocker above was resolved on 2026-09-05. Both registered
humans must now complete their independent reviews of the corrected payload.

- [progress] 2026-09-05 by root: Applied approved editorial findings and regenerated
  readable evidence for all 500 candidates (2,803 distinct source synsets). Safely
  refreshed both untouched review packages, preserving identities, blank attestations
  and all 500 pending decisions per reviewer. Original bytes are retained in adjacent
  UUID `.backup` files. Final lexical-evidence SHA-256:
  `90ba6c9517078b999d909f5dc6a0329f71562a6f3a72db3d5097c126a15695be`.
  User approval of AI corrections is not an independent native-reviewer attestation.
  Compilation correctly refuses these pending packages. See
  `docs/SPANISH_A1_IMPLEMENTATION_VERIFICATION.md` for final integration evidence.
