---
id: "render-spanish-a1-semantic-review-options"
title: "Render Spanish A1 semantic review options"
status: "done"
priority: "high"
assignee: "semantic-ui"
branch: ""
skills: []
specs: ["spanish-a1-licensed-semantic-review-references"]
depends_on: []
blocks: []
blocked_by: []
relates_to: []
created: "2026-09-05T12:00:00.000Z"
updated: "2026-09-05T12:21:28.812Z"
verified: "2026-09-05T12:21:04.320Z"
verified_sha: "c4aed38c815d68756ae5e8b80f7890bb1de9abf2"
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Implement the approved semantic reference display in the existing local reviewer UI. Read spanish-a1-licensed-semantic-review-references spec. Show optional Spanish gloss/example and mandatory English definition/member lemmas/examples with language labels; one choice per unique synset preserves canonical sense identity. Plain text rendering only, no Slovak leakage. Include useful candidate gender/forms if available. Own scripts/spanish-a1-review/*, scripts/spanish-a1-review-server.mjs, and review-server tests only. Preserve autosave and conflict protections and fix any within-scope defects discovered. Coordinate canonical subject fields with semantic agent; do not edit pipeline. Add behavioral UI tests if practical.

## Acceptance Criteria

- [x] Approved scoped changes implemented with relevant regression evidence.
- [x] Original reports and all existing human review work preserved.

## Verify

```sh
node --check scripts/spanish-a1-review/app.js
git diff --check
```

## Evidence

- [progress] 2026-09-05T12:15:21.636Z by semantic-ui: Implemented readable licensed semantic options, candidate gender/forms, source license disclosure, and async draft/finalization protections. Four behavioral browser tests pass; integrated server suite awaits corrected candidate evidence regeneration.

### verify 2026-09-05T12:15:21.730Z @ c4aed38c — pass

- `node --check scripts/spanish-a1-review/app.js` exit=0
- `git diff --check` exit=0

- [progress] 2026-09-05T12:21:04.191Z by semantic-ui: All 12 server/browser tests pass against corrected semantic assets, including plain-text source rendering, source attribution, canonical sense submission, isolation, tampering rejection, documented synthetic exception, concurrent writers, and async draft/finalization protections. Focused eslint and syntax check passed. Actual human review packages were untouched by this task.

### verify 2026-09-05T12:21:04.320Z @ c4aed38c — pass

- `node --check scripts/spanish-a1-review/app.js` exit=0
- `git diff --check` exit=0
