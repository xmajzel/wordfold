---
id: "spanish-complete-catalog-batch-plan"
title: "Complete Spanish vocabulary inventory and bounded editorial batches"
status: "approved"
category: "feature"
created: "2026-09-05T00:00:00.000Z"
updated: "2026-09-05T00:00:00.000Z"
---

## Problem and desired outcome

685 existing drafts and 138 next selections are a partial inventory, not a complete
A1–C2 vocabulary release. The owner requests a full plan and a worker for each
batch. The proposed completion boundary is a versioned, explicitly selected
Wordfold vocabulary inventory, not every dictionary word or a complete skills course.

## Specification

The canonical plan is docs/SPANISH_COMPLETE_CATALOG_PLAN.md. Six level planning
tasks each cover eight editorial packages (48 coverage cells). Agents are assigned
to individual level planning tasks in waves. Each package's final inventory will
be sorted into at most 50-sense authoring shards, each with separate Spanish and
Slovak reviewer tasks, correction/re-review and integration dependencies.

Planning/research is requested now. Bulk sense selection/freeze and authoring of
the newly specified scope follow owner approval under AGENTS.md; publication
policy remains the separately proposed spanish-public-v1-and-inline-progress
amendment. Existing approved draft work does not authorize silently changing that
production gate. The inline progress fix is separately approved and can finish now.

## Changes and compatibility

Planning touches docs and board records only. Subsequent approved implementation
will add inventory/shard/review manifests under assets/catalog/spanish, extend
existing Spanish pipeline validation and tests, then use the course-catalog adapter
for reviewed preview integration. Production compilation and availability UI are
a later gated phase. No new backend API or SQL migration is proposed.

Preserve all saved IDs and prior review evidence. Releveling requires an explicit
compatibility decision; no automatic user-progress rewrite. Entries carry original
Spanish definitions/examples, sense-specific Slovak hints, forms, register and
level evidence. es-ES pronunciation support remains; AI text checks cannot certify
audio. Paid generation, deployments and EAS builds are excluded.

## Acceptance and verification

- All 48 cells have level-specific coverage, gaps and justified dispositions.
- Every existing entry and next selection is reconciled before counts are frozen.
- Every final sense has exactly one authoring owner and two independent reviews.
- All required learner fields, source/license restrictions and morphology checks
  pass; review evidence matches final entry and batch hashes.
- Counts derive from the frozen deduplicated inventory, not quotas; any incomplete
  objective blocks a full-inventory completion claim.
- Release checks cover search, add, study, hints, pronunciation routing, Library
  counts, persistence, import, course isolation, English regressions and normal
  non-preview builds. Physical-device voice/large-text checks are explicit gates.

## Unresolved decisions

The owner replied "implement" to the explicit plan approval request on 2026-09-05.
The 48-cell batching/closure plan and recommended sense-introduction level meaning
are approved. Exact frozen inventory acceptance and the separate production-policy
decision remain later gates. No native attestations may be inferred.
