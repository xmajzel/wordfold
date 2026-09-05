---
id: "implement-spanish-a1-semantic-evidence"
title: "Implement Spanish A1 semantic evidence"
status: "done"
priority: "high"
assignee: "semantic-evidence"
branch: ""
skills: []
specs: ["spanish-a1-licensed-semantic-review-references"]
depends_on: []
blocks: []
blocked_by: []
relates_to: []
created: "2026-09-05T12:00:00.000Z"
updated: "2026-09-05T12:24:04.898Z"
verified: "2026-09-05T12:22:24.994Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Implement the approved spanish-a1-licensed-semantic-review-references spec: pinned English OMW source, license, deterministic extraction with ILI equality/satellite mapping and unique synset choices/aliases, strict validator, and safe pending-only review refresh command retaining reviewer metadata and refusing ANY existing human work. Own scripts/prepare-spanish-a1-sources.mjs, scripts/spanish-a1-pipeline.mjs, source manifest, full WordNet license and source/pipeline/assets tests. Parent handles docs, regeneration and refresh after candidate edits. No app runtime changes.

## Acceptance Criteria

- [x] Approved scoped changes implemented with relevant regression evidence.
- [x] Original reports and all existing human review work preserved.

## Verify

```sh
pnpm test -- src/features/content/spanish-a1-pipeline.test.js src/features/content/spanish-a1-source-preparation.test.js
git diff --check
```

## Evidence

- Final source/pipeline verification passed; the additional altered-subject regression also passed after self-review. Actual asset tests passed 3/3 against the corrected 500-entry dataset. No original review/report files were changed by this task; the parent performed guarded regeneration and refresh after integration.

- [progress] 2026-09-05T12:21:06.665Z by semantic-evidence: Pinned English source and complete license; exact archive/XML verification and semantic mapping/grouping implemented. 34 focused tests passed covering malformed source evidence and lossless pending-only refresh refusals. Final integration assets handled by parent.

### verify 2026-09-05T12:22:24.994Z @ c4aed38c — pass

- `pnpm test -- src/features/content/spanish-a1-pipeline.test.js src/features/content/spanish-a1-source-preparation.test.js` exit=0
- `git diff --check` exit=0
