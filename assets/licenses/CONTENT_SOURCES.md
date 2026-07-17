# Content sources

## Open English WordNet 2025

Definitions, examples, parts of speech, and sense data are adapted from Open English WordNet 2025 by the Global WordNet Association.

- Source: https://github.com/globalwordnet/english-wordnet
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/

Open English WordNet definitions, examples, parts of speech, and sense identifiers are also used in the generated CEFR-aligned catalog.

## CEFR-J Wordlist 1.6

The A1–B2 headwords and source parts of speech are adapted from the CEFR-J Wordlist Version 1.6, compiled by Yukio Tono at Tokyo University of Foreign Studies.

- Source: https://www.cefr-j.org/download.html
- Terms: research, educational, and commercial use and creation of modified wordlists are permitted with proper acknowledgement of the source; see the source workbook and download page
- Required acknowledgement: The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from https://www.cefr-j.org/download.html on 16 July 2026.

Changes made by Wordfold: slash-separated spelling variants are expanded, a single lowest level is selected where one normalized headword has multiple CEFR-J levels, entries are matched to a compatible Open English WordNet part of speech and sense, and entries without a compatible sense are excluded. The original source rows and all transformations are retained in the source CSV and QA manifest.

## Octanove Vocabulary Profile C1/C2 1.0

The C1–C2 headwords and source parts of speech are adapted from the Octanove Vocabulary Profile C1/C2 Version 1.0, created by Octanove Labs and published through Open Language Profiles.

- Source: https://github.com/openlanguageprofiles/olp-en-cefrj
- License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- License text: https://creativecommons.org/licenses/by-sa/4.0/

Changes made by Wordfold: duplicate source rows are collapsed, unresolved C1/C2 level conflicts are excluded, one documented `vern` to `verb` source typo is corrected, lower CEFR-J levels take precedence over overlapping C1/C2 terms, and remaining entries are matched to compatible Open English WordNet senses. Octanove-derived catalog entries remain available under CC BY-SA 4.0.

## Generated CEFR-aligned catalog

`assets/catalog/cefr-catalog.json` is generated from the two level sources above and Open English WordNet. It is CEFR-aligned; it is not an official vocabulary list published by the Council of Europe.

The exact source rows are in `assets/catalog/sources/`. `assets/catalog/cefr-catalog-manifest.json` records source versions, entry provenance, conflicts, exclusions, transformations, counts, and validation results.

## NGSL discovery packs

The optional Spoken, Business, and Academic word lists are adapted from work by Charles Browne, Brent Culligan, and Joseph Phillips through the New General Service List Project.

- Source: https://www.newgeneralservicelist.org/
- License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- License text: https://creativecommons.org/licenses/by-sa/4.0/

Changes made by Wordfold: the source lists are converted to JSON, associated with Open English WordNet senses, and filtered against words already in the user's library.

## Publisher vocabulary sources not included

No Oxford, Cambridge, British Council, Headway, or other publisher vocabulary list has been copied or scraped. The implementation plan to follow only after written permission is recorded in `docs/FUTURE_PUBLISHER_VOCABULARY_PLAN.md`.

## Wordfold curated senses

The short project and business definitions in `assets/catalog/curated-senses.json` are original Wordfold content. They are ranked ahead of dictionary senses where a modern work-related meaning is more useful to this app's starter audience.
