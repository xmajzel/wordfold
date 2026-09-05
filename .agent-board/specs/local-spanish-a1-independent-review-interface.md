---
id: "local-spanish-a1-independent-review-interface"
title: "Local Spanish A1 independent review interface"
status: "approved"
category: "content"
created: "2026-09-04T11:30:02.193Z"
updated: "2026-09-04T11:30:02.193Z"
---

## Context

The immutable Spanish A1 pilot already has separate, hash-bound Spanish-content and
Slovak-hint review packages, but editing roughly 1.3 MB and 305 KB of raw JSON is
error-prone. The two registered native-speaker reviewers need a safe local interface
that preserves the existing review schema and production gates.

## Decisions

- Add a dependency-free Node HTTP server and static HTML/CSS/JavaScript review client,
  following the existing pronunciation-review server conventions.
- Bind only to `127.0.0.1` and accept exactly one caller-selected review file beneath
  `.artifacts` per process. Never load or expose the other reviewer's package.
- Validate the source manifest, candidate dataset, lexical-evidence sidecar, review
  kind, package hashes, reviewer identity, qualification, and decision shape before
  serving.
- Show one candidate at a time with progress, search/filtering, keyboard-accessible
  navigation, and approve/change-request/reject controls. Required notes are enforced
  for change requests and rejections.
- Spanish sessions show lemma, POS, definition, example, A1/category rationale, and
  offered OMW senses. Approval requires exactly one offered sense, or the documented
  original-editorial exception when no sense is offered.
- Slovak sessions show the exact Spanish sense context and Slovak hint. They do not
  expose Spanish reviewer decisions.
- Save each decision atomically to the selected JSON package and support safe resume.
  Reject malformed payloads, stale hashes, path traversal, unsupported methods,
  oversized requests, and conflicting concurrent writes.
- A finalization action requires no pending decisions plus the reviewer's own truthful
  attestation; it records an ISO completion date. It does not compile or promote data.
- Add `pnpm spanish:a1:review` and document exact Spanish and Slovak launch commands.
- Do not add dependencies, authentication, remote access, app screens, catalog data,
  automatic approvals, production promotion, or EAS/native builds.

## Likely files

- `scripts/spanish-a1-review-server.mjs`
- static assets under `scripts/spanish-a1-review/`
- focused server/client-contract tests under `src/features/content/`
- `package.json`
- `docs/SPANISH_CATALOG_EDITORIAL_POLICY.md`

## Acceptance criteria

1. Either registered review package can be opened locally and resumed without editing
   JSON by hand.
2. The server exposes only the selected package, validates immutable hashes, and uses
   safe atomic writes.
3. Spanish sense/exception rules and Slovak decision rules match the existing pipeline.
4. Finalization cannot succeed with pending or invalid decisions and never fabricates
   reviewer attestations.
5. Focused tests, the full content pipeline tests, TypeScript, lint, and
   `git diff --check` pass; the production application remains unchanged.

## Tasks

- `build-local-spanish-a1-independent-review-interface`
