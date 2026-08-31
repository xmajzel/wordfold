---
id: "add-spanish-public-private-and-downloadable-neural-pronunciation-parity"
title: "Add Spanish public, private, and downloadable neural pronunciation parity"
status: "todo"
priority: "normal"
assignee: ""
branch: ""
skills: []
specs: ["slovak-native-spanish-course-research-and-implementation-specification"]
depends_on: ["approve-slovak-native-spanish-course-semantics-and-content-source-path", "produce-and-validate-the-spanish-a1-c2-catalog-with-slovak-hints"]
blocks: ["run-multilingual-regression-native-device-content-and-release-verification"]
blocked_by: []
relates_to: ["slovak-native-spanish-course-research-and-implementation-specification"]
created: "2026-08-27T18:04:45.304Z"
updated: "2026-08-27T18:06:00.700Z"
verified: ""
verified_sha: ""
archived: ""
archived_at: ""
archived_reason: ""
superseded_by: ""
---

## Goal

Extend current public, private, and downloadable neural pronunciation to approved
Spanish locales while preserving text, consent, integrity, cost, and privacy controls.

## Acceptance Criteria

- [ ] Each launch locale/voice passes two independent native reviews of at least 200
      items, at least 95% acceptable, and zero wrong-locale samples.
- [ ] Public pronunciation catalog and APIs include explicit language identity and
      reject wrong-language, wrong-locale, noncanonical, or colliding IDs.
- [ ] Additive Supabase migrations expand public/private constraints and RPC validation;
      no deployed migration is edited.
- [ ] Spanish private pronunciation renews consent after updated disclosure and retains
      authentication, quotas, signed URLs, 30-day deletion, and verified local caching.
- [ ] Offline manifest/index/shards support each approved Spanish locale and all six
      levels with immutable checksums, pause/resume/removal, disk checks, and automatic
      library reconciliation.
- [ ] Paid backfill/storage cost and measured pack sizes are approved before generation.
- [ ] Public/private/offline client, Edge, SQL, script, and UI tests cover Spanish and
      retain English invariants.
- [ ] No paid generation, deployment, or EAS cloud build runs without separate explicit
      approval immediately before the action.

## Verify

```sh
pnpm test -- src/features/pronunciation src/components/pronunciation supabase/functions
pnpm typecheck
pnpm lint
```
