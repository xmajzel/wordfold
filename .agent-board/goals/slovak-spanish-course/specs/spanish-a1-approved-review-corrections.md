---
id: "spanish-a1-approved-review-corrections"
title: "Spanish A1 approved review corrections"
status: "approved"
category: "content"
created: "2026-09-05T12:00:00.000Z"
updated: "2026-09-05T12:00:00.000Z"
---

## Approval and scope

The user approved both completed AI editorial reports on 2026-09-05, following
approval of `spanish-a1-licensed-semantic-review-references`. Apply the reports'
concrete Spanish wording, sense-alignment, Slovak-hint, and forms corrections to
the existing draft; reconcile overlapping alternatives in a durable before/after
ledger. These are owner-approved editorial corrections, not impersonated native
reviewer sign-offs.

## Expected behavior and approach

- Preserve 500 candidate identities, category quotas, draft state, and original
  learner content. Choose one clear meaning for each corrected definition/example
  and align its hint. Simplify the specific learner sentences identified in the
  reports and record useful gender/alternative forms.
- Keep nominal multiword expressions grammatical: use NOUN and their ordinary
  gender while retaining stable sense IDs and multiword status.
- Implement the separately approved WordNet reference enrichment and recalculate
  coverage after these POS corrections, rather than enforcing obsolete counts.
- Rebuild evidence for the corrected payload and refresh only untouched pending
  reviewer packages. Preserve reviewer IDs and qualifications; retain backups and
  reject any existing decisions, notes, sense selections, or attestations.
- Record the disposition of all 94 report findings, including overlapping items,
  and explicitly retain unresolved curriculum/CEFR questions for human validation.

## Files and interfaces

Candidate JSON, a committed editorial-correction ledger and focused tests change
alongside the already-approved source pipeline, review UI, license, and docs work.
No database migration or production runtime API changes are required. Review
payload hashes and grammatical subject fields change with the new draft.

## Limits and risks

The 500-entry quota-based pilot is not a self-contained course or validated first-500
list. Reports do not establish replacement headwords or authoritative A1 grades;
do not invent those decisions or silently reshuffle levels/quotas. New WordNet
descriptions remain source evidence rather than CEFR grades or learner text.

## Acceptance and verification

All concrete entry findings have explicit reconciled dispositions; source and
candidate validation passes; every offered synset has compatible semantic evidence;
the local UI presents readable source meanings and grammatical forms; untouched
reviewer identities survive guarded refresh. Relevant content/server/client tests,
TypeScript, lint, and diff checks pass. Verify the running review UI with copies,
and record any release blockers without marking human reviews complete.
