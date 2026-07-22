# Pronunciation Phase 3D: bounded English catalog backfill

Status: **completed and verified July 21, 2026**.

## Approved result

Generate and persist one Azure Standard Neural MP3 for every pinned CEFR catalog identity in both
English locales:

- 8,300 catalog identities;
- `en-US` with `en-US-AvaNeural`;
- `en-GB` with `en-GB-RyanNeural`;
- 16,600 ready assets in total;
- synthesis version `azure-public-preview-v1`.

The catalog is fixed to SHA-256
`7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b`.
Its terms total 62,156 characters per locale and 124,312 characters across both locales. At the
planning price of USD 15 per million neural characters, the estimated Azure synthesis charge is
USD 1.864680. This is a planning estimate rather than an invoice guarantee; taxes, currency
conversion, and future provider pricing can differ.

## Safety and execution behavior

The runner in `scripts/pronunciation-backfill.mjs`:

- performs a network-free `plan` by default;
- requires both `--execute` and `--max-cost-usd 2` before authenticated generation;
- rejects any catalog checksum, locale set, synthesis version, or estimated cost outside the
  approved plan;
- asks for the operator's existing Supabase email and password in the terminal, hides the password,
  and neither persists nor logs those credentials;
- invokes the existing authenticated `pronunciation-public` Edge Function, preserving its canonical
  catalog lookup, fixed voices, immutable storage, validation, deduplication, and audit trail;
- uses concurrency four with bounded pending, transient HTTP, session-refresh, and network retries;
- durably records every potentially billable attempt before sending it and refuses to cross the
  supplied two-dollar character equivalent across retries, midnight boundaries, or restarts;
- atomically checkpoints only ready responses under the ignored `.artifacts` directory and safely
  resumes by replaying missing identities; server-side cache hits prevent duplicate Azure charges;
- temporarily changes the development limits to 20,000 requests/hour and 125,000 generated
  characters/day for both the operator and the project;
- restores the normal 20 requests/hour, 1,000 user characters/day, and 10,000 global
  characters/day limits after success, failure, SIGINT, or SIGTERM.

An uncatchable process termination or machine failure can prevent automatic restoration. The
manual recovery command is:

```sh
pnpm pronunciation:backfill:restore-limits
```

The elevated 125,000-character global limit still bounds new Azure synthesis below the approved
two-dollar planning ceiling at the pinned USD 15/million price. The database and Edge Function
accept 20,000 only as the maximum configurable hourly value; the deployed secret remains the actual
runtime limit.

## Operator commands

Review the immutable plan without network or Azure usage:

```sh
pnpm pronunciation:backfill:plan -- --json
```

After the migration and Edge Function update are deployed, start or resume the paid backfill from
an interactive terminal:

```sh
pnpm pronunciation:backfill -- run --execute --max-cost-usd 2
```

The successful terminal condition is exactly `16600/16600` ready responses in the matching
checkpoint. A failed or pending response is never checkpointed as complete.

## Deployment and verification record

- Migration `20260721210000_allow_bounded_pronunciation_backfill.sql` is recorded on the linked
  development project. It changes only the configurable hourly validation ceiling from 1,000 to
  20,000; schema lint reports no errors.
- `pronunciation-public` version 2 is active with JWT verification enabled. An unauthenticated probe
  returned `401`, before catalog lookup or provider access.
- The network-free runner plan reports exactly 16,600 MP3s, 124,312 characters, and USD 1.864680.
- The full application suite passes 52 suites and 215 tests; TypeScript, lint, deterministic catalog
  validation, checkpoint resume, and durable attempt-ceiling tests pass.
- Before the paid run, linked table statistics reported 8,300 catalog inputs, zero pronunciation
  assets, and zero pronunciation requests. No authenticated function request or Azure generation
  was made while preparing this phase.

## Completion record

- The runner completed and checkpointed exactly 16,600 of 16,600 ready responses, then reported a
  successful restoration of the normal development limits.
- Exact linked SQL counts report 16,600 ready assets, zero pending assets, zero failed assets, 8,300
  `en-US` assets, 8,300 `en-GB` assets, and 16,600 objects in the `pron-public` storage bucket.
- The server audit contains 16,606 request rows and exactly 124,312 allowed billed characters. At
  the pinned USD 15/million planning rate, the resulting synthesis estimate is USD 1.864680.
- The conservative local attempt journal contains 16,601 attempts and 124,317 characters
  (USD 1.864755 worst-case). The five-character difference did not appear in server billed
  characters, so it did not add provider-billed generation.
- The matching local checkpoint was finalized at `2026-07-21T21:39:04.864Z`.
- Six public MP3s sampled across the beginning, middle, and end of both locale catalogs returned
  HTTP 200 with `audio/mpeg`; every downloaded byte length and SHA-256 matched its ready asset
  metadata.

## Explicit exclusions

This phase does not translate catalog text, generate other locales, use the private/manual word
path, automatically synthesize newly inserted words, download the full corpus to a device, enable a
production rollout, or consume an Expo EAS build. The mobile app keeps its existing on-demand and
device-fallback behavior.
