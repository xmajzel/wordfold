# Pronunciation Phase 3A: blinded provider bakeoff

Approved on 2026-07-20. This phase builds evaluation tooling only. It does not select or deploy a
production pronunciation provider.

## Problem

Wordfold needs mostly-great reference pronunciation across every configured locale. Provider
marketing and voice availability do not establish learning-reference quality, especially for
heteronyms, regional accents, abbreviations, and loanwords. A provider must be selected from
blinded native-speaker evidence rather than convenience.

## Expected behavior

- A versioned candidate screening corpus contains 30 items for each of `en-US`, `en-GB`, `es-ES`,
  `es-MX`, `de-DE`, `el-GR`, and `sk-SK`.
- Each locale covers common words, inflections, phrases, sense-sensitive words, proper names or
  loanwords, and abbreviations.
- Candidate corpus entries remain blocked from paid generation until a native reviewer marks the
  entire locale approved and records a reviewer identifier and review date.
- Two explicit Google Cloud TTS and two explicit Azure Speech voices are configured per locale.
  Provider defaults are never accepted implicitly.
- The CLI can validate the inputs, produce a cost/character plan, generate provider audio, create
  a blinded reviewer package, and score two independent ratings per sample.
- Scoring reports completeness, acceptability, wrong-locale findings, disagreement, latency, and
  provider/voice totals. It does not recommend a voice unless every sample has two independent
  ratings, no wrong-locale result exists, and acceptability is at least 95%.

## Safety and credentials

- `validate`, `plan`, `blind`, and `score` do not call a paid provider.
- `generate` requires `--execute` and an explicit `--max-cost-usd` no greater than `20`.
- Generation stops before provider calls if the estimated cost exceeds the supplied cap, a locale
  is not native-reviewed, a voice is missing, or credentials are unavailable.
- Google uses Application Default Credentials through the official Cloud TTS client.
- Azure reads `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`, requires an explicit
  `AZURE_SPEECH_TIER=S0` paid-tier attestation, and uses the documented regional REST endpoint.
  Free-tier Azure output is rejected because it lacks the required output-use rights.
- Secrets are never accepted as CLI arguments and are never written to manifests or logs.
- Generated audio, private provider mappings, and ratings live under `.artifacts/`, which is not
  committed.

## Data and command surface

- `assets/pronunciation/bakeoff-corpus.json` stores exact synthesis text, category, context, and
  native-review state. Text is preserved exactly after rejecting empty or surrounding whitespace.
- `assets/pronunciation/bakeoff-candidates.json` pins provider, model/tier, voice, output format,
  and a conservative planning price. Prices are planning inputs, not provider quotes.
- `pnpm pronunciation:bakeoff:validate` validates the committed inputs.
- `pnpm pronunciation:bakeoff:plan -- --json` returns machine-readable sample, character, and cost
  totals without contacting providers.
- `pnpm pronunciation:bakeoff -- generate --execute --max-cost-usd <amount>
  --output .artifacts/pronunciation-bakeoff/run-1` performs paid generation after every gate passes.
- `pnpm pronunciation:bakeoff -- blind --input .artifacts/pronunciation-bakeoff/run-1
  --output .artifacts/pronunciation-bakeoff/reviewer-1
  --key-output .artifacts/pronunciation-bakeoff/private/run-1-key.json --seed <non-secret-seed>`
  creates opaque sample filenames and a reviewer manifest while writing the provider mapping to a
  separately located private answer key.
- `pnpm pronunciation:bakeoff -- score --input .artifacts/pronunciation-bakeoff/reviewer-1
  --key .artifacts/pronunciation-bakeoff/private/run-1-key.json --ratings <ratings.json>` prints a
  JSON quality report.

## Files and modules

- New specification, corpus, provider-candidate configuration, CLI, and focused CLI tests.
- `package.json`, `pnpm-lock.yaml`, and `.gitignore` change only for the new commands, Google's
  development-only client, and generated artifacts.

## Edge cases

- Duplicate item IDs or duplicate text-and-context pairs within one locale are rejected. Repeated
  text with different sense context is intentional because it exposes unresolved heteronyms.
- Unsupported locales, categories, providers, formats, malformed review metadata, mismatched voice
  locales, and non-finite or negative prices are rejected.
- SSML-sensitive characters are escaped before Azure requests.
- Existing generated files are reused only when their recorded identity and SHA-256 match.
- A generation failure is recorded without exposing raw credentials; completed files remain
  resumable.
- Ratings from the same reviewer cannot satisfy the two-reviewer requirement.
- Unknown sample IDs, duplicate reviewer/sample pairs, missing ratings, or non-boolean rating flags
  prevent a recommendation.

## Explicitly unchanged

- No application UI, playback path, cache behavior, Expo/native module, database, migration,
  Supabase Storage, Edge Function, authentication, or PowerSync behavior changes.
- No provider credentials, generated audio, or rating results are committed.
- No provider is selected and no release-quality claim is made by the 30-item screening pass.
- Private user text is never sent to a cloud provider in this phase.

## Minimal acceptance criteria

- Validation confirms exactly 30 categorized candidate items for each of the seven locales and two
  voices per provider/locale.
- Planning is deterministic, makes no network calls, and reports conservative cost below the
  explicit hard ceiling.
- Paid generation cannot start without native corpus approval, credentials, `--execute`, and an
  adequate cap no greater than $20.
- Blinding exposes text, context, locale, and opaque sample IDs but no provider or voice identity.
- Scoring requires two independent ratings per sample and applies the 95% and zero-wrong-locale
  gates.
- Focused tests, TypeScript, lint, and the existing Jest suite pass.

## Deferred gate

The candidate multilingual corpus is not trusted merely because it is committed. Native review is
a required human step before generation. After screening identifies promising voices, a separate
approved phase expands each proposed launch voice to the release corpus of at least 200 items per
locale and completes two-native-rater evaluation before production integration.
