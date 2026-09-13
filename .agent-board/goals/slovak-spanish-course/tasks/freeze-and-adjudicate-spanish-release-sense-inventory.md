---
id: "freeze-and-adjudicate-spanish-release-sense-inventory"
title: "Freeze and adjudicate Spanish release sense inventory"
status: "todo"
priority: "high"
assignee: ""
branch: ""
skills: []
specs: ["spanish-complete-catalog-batch-plan"]
depends_on: ["plan-spanish-a1-complete-coverage-batches", "plan-spanish-a2-complete-coverage-batches", "plan-spanish-b1-complete-coverage-batches", "plan-spanish-b2-complete-coverage-batches", "plan-spanish-c1-complete-coverage-batches", "plan-spanish-c2-complete-coverage-batches", "select-spanish-a1-f-foundations-senses", "select-spanish-a1-p-people-and-health-senses", "select-spanish-a1-h-home-food-and-buying-senses", "select-spanish-a1-t-travel-and-services-senses", "select-spanish-a1-w-education-work-and-technology-senses", "select-spanish-a1-c-culture-leisure-and-media-senses", "select-spanish-a1-s-society-and-nature-senses", "select-spanish-a1-d-functions-and-discourse-senses", "select-spanish-a2-f-foundations-senses", "select-spanish-a2-p-people-and-health-senses", "select-spanish-a2-h-home-food-and-buying-senses", "select-spanish-a2-t-travel-and-services-senses", "select-spanish-a2-w-education-work-and-technology-senses", "select-spanish-a2-c-culture-leisure-and-media-senses", "select-spanish-a2-s-society-and-nature-senses", "select-spanish-a2-d-functions-and-discourse-senses", "select-spanish-b1-f-foundations-senses", "select-spanish-b1-p-people-and-health-senses", "select-spanish-b1-h-home-food-and-buying-senses", "select-spanish-b1-t-travel-and-services-senses", "select-spanish-b1-w-education-work-and-technology-senses", "select-spanish-b1-c-culture-leisure-and-media-senses", "select-spanish-b1-s-society-and-nature-senses", "select-spanish-b1-d-functions-and-discourse-senses", "select-spanish-b2-f-foundations-senses", "select-spanish-b2-p-people-and-health-senses", "select-spanish-b2-h-home-food-and-buying-senses", "select-spanish-b2-t-travel-and-services-senses", "select-spanish-b2-w-education-work-and-technology-senses", "select-spanish-b2-c-culture-leisure-and-media-senses", "select-spanish-b2-s-society-and-nature-senses", "select-spanish-b2-d-functions-and-discourse-senses", "select-spanish-c1-f-foundations-senses", "select-spanish-c1-p-people-and-health-senses", "select-spanish-c1-h-home-food-and-buying-senses", "select-spanish-c1-t-travel-and-services-senses", "select-spanish-c1-w-education-work-and-technology-senses", "select-spanish-c1-c-culture-leisure-and-media-senses", "select-spanish-c1-s-society-and-nature-senses", "select-spanish-c1-d-functions-and-discourse-senses", "select-spanish-c2-f-foundations-senses", "select-spanish-c2-p-people-and-health-senses", "select-spanish-c2-h-home-food-and-buying-senses", "select-spanish-c2-t-travel-and-services-senses", "select-spanish-c2-w-education-work-and-technology-senses", "select-spanish-c2-c-culture-leisure-and-media-senses", "select-spanish-c2-s-society-and-nature-senses", "select-spanish-c2-d-functions-and-discourse-senses"]
blocks: []
blocked_by: []
relates_to: []
created: "2026-09-05T14:15:02.511Z"
updated: "2026-09-05T14:30:50.400Z"
verified: ""
verified_sha: ""
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

After approval of the complete-catalog batch plan, enumerate original sense
selections for all 48 level/package cells, audit the 685 existing entries and 138
next selections, resolve global duplicates and freeze exact IDs and counts.
Do not manufacture a completed inventory from representative examples.

Read docs/SPANISH_INVENTORY_CONTROLLER_REVIEW.md alongside the proposed batch
files and generated report. It records controller handoff scope, raw hashes and
cross-cell findings that a same-lemma collision scan cannot discover on its own,
including the existing foto/fotografía ID pair. Enumeration-task completion is
not independent placement/coverage approval or permission to publish.

## Acceptance Criteria

- [ ] Every objective has selected senses, existing coverage or an explicit justified exclusion.
- [ ] All 685 existing entries and all 138 planned selections have a disposition.
- [ ] Stable identity, distinct senses, relevel compatibility and borderline decisions are adjudicated.
- [ ] Exact per-level and total unique sense counts are derived after adjudication.
- [ ] Deterministic authoring shards of at most 50 senses and separate ES/SK review tasks are created.
- [ ] Owner accepts the frozen inventory before bulk authoring starts.

## Verify

Required inventory gate: zero duplicate canonical sense keys, zero orphan objectives,
zero pending inclusion/relevel decisions, exact legacy/next-selection dispositions,
derived counts and reproducible sorted shard membership. Add executable validators
with the approved implementation; do not present future gates as checks already run.
