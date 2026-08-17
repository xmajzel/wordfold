# Future publisher vocabulary plan

## Status

Oxford, Cambridge, British Council, Headway, and other publisher vocabulary lists are not included in Wordfold today. Educational use by itself is not treated as permission to copy, modify, scrape, or redistribute those lists.

This plan may proceed for a source only after Wordfold receives written permission or identifies published terms that clearly authorize the intended use.

## Permission that must be documented

The written permission or license must explicitly cover:

- copying the vocabulary data into Wordfold;
- offline redistribution inside iOS, Android, and web builds;
- commercial use, even if the app is currently free;
- modification, normalization, deduplication, level mapping, and linking to third-party dictionary senses;
- distribution through app stores and normal backup or update channels;
- required attribution, trademark wording, notices, and source links;
- the permitted source version, territories, languages, duration, and termination or update obligations.

The original permission should be retained in private legal records. A non-confidential summary, the approved source version, the applicable terms, and the exact attribution text should be committed under `assets/licenses/` before source data is added.

## Implementation sequence after permission

1. Archive the permission summary and source checksum without importing any data yet.
2. Add the untouched source export under `assets/catalog/sources/` when redistribution of that source file is permitted; otherwise keep it outside the repository and document the reproducible acquisition step.
3. Add a source-specific importer. Do not scrape a public website unless the written terms explicitly allow automated extraction.
4. Preserve the original headword, source category or level, part of speech, source version, row identifier, and any spelling variants as provenance.
5. Normalize terms with the existing Wordfold normalization rule, expand only documented aliases, and report all transformations.
6. Resolve duplicates using an explicit source-priority policy. Do not silently merge conflicting levels or meanings; route them to a review report.
7. Match each accepted entry to a compatible Open English WordNet sense or a separately licensed definition. Exclude entries that lack a usable, permitted definition until they are reviewed.
8. Generate a separate catalog or source layer so publisher provenance remains visible and removable without affecting user-created words.
9. Add source counts, checksums, conflicts, exclusions, attribution, and license checks to the QA manifest and automated tests.
10. Review the in-app source label and attribution screen against the written permission before release.

## Product behavior

If a publisher source is approved, it should appear as an optional built-in category. Browsing it must remain read-only and must not affect learning statistics or reminders. Adding an entry should create one normal word in `My words`, reuse the existing normalized-term duplicate guard, and preserve the chosen sense.

Publisher categories must not replace or silently relabel the current CEFR-aligned A1–C2 catalog. If multiple sources assign different levels, Wordfold should show their provenance independently until a reviewed mapping policy is approved.

## Release gate

A publisher-backed catalog is releasable only when all of the following are true:

- the permission scope matches the shipped behavior and distribution channels;
- the approved source version and checksum are recorded;
- required attribution is visible in the app and repository;
- every shipped entry has provenance and a permitted definition;
- conflicts and exclusions have been reviewed;
- automated catalog QA passes;
- a final permission check is completed for the release candidate.
