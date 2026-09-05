# Spanish catalog editorial and release policy

## Status and direction

The Spanish course teaches Spanish to Slovak-native learners. Runtime identity is
`es-sk`: Spanish is the learned, defined, example, and pronounced language; Slovak is
the revealable hint language.

`assets/catalog/spanish/cefr-pilot.json` is original Wordfold draft content used only
to exercise the six-level data pipeline. Normal catalog APIs exclude it. It must not
be represented as reviewed, production-ready, or an official CEFR vocabulary list.

## Instituto Cervantes reference boundary

Instituto Cervantes granted Wordfold written permission on 2026-08-27 to use the Plan
Curricular del Instituto Cervantes (PCIC) as a reference framework for the development,
organization, and classification of Spanish-learning content across A1-C2 in a
commercial digital application. Relevant PCIC levels, categories, and classifications
may be referenced in the content structure. The redacted correspondence is retained in
`docs/legal/INSTITUTO_CERVANTES_PCIC_PERMISSION.md`.

Wordfold may describe the curriculum as “Spanish learning content structured according
to the Plan Curricular del Instituto Cervantes (PCIC), A1-C2.” It must not imply
certification, accreditation, endorsement, or official validation, and must not use the
Instituto Cervantes logo or name as a promotional mark without separate authorization.

The permission does not authorize unrestricted reproduction of protected PCIC content.
Every shipped headword list, definition, example, Slovak hint, and other learner-facing
text must come from an independently licensed source or be original Wordfold work with
its own evidence and review trail.

## Entry policy

- Nouns use a stable lemma. Gender and irregular plural information must be handled by
  a documented presentation rule before production content is created.
- Verbs use the infinitive. Reflexive/pronominal verbs remain distinct when the
  pronoun changes meaning or normal learner usage.
- Adjectives use one documented canonical gender form while preserving important
  alternative forms in structured editorial evidence.
- Inflected forms are separate entries only when independently levelled or required to
  teach an irregular, lexicalized, or highly frequent form.
- Multiword expressions are included only when they have a stable meaning and source
  evidence. Arbitrary example fragments are excluded.
- Homographs require separate sense identities when definitions or parts of speech
  differ. IDs always start with `es-sk:`.
- Proper names, abbreviations, loanwords, and regional variants require an explicit
  inclusion reason.
- Initial content uses neutral broadly understood Spanish. Regional pronunciation
  locale is separate from catalog identity; the first catalog does not fork into
  Spain and Mexico vocabulary variants.

## Level and writing policy

Level assignments are described as CEFR-aligned, never official. Each entry retains
its level evidence and source version. Conflicting or weak evidence is review-gated.

Definitions and examples are original concise Spanish. They must match the selected
sense and level, avoid circular definitions, and avoid copying dictionary or course
text. Slovak hints must match that same sense rather than merely the most common
translation of the spelling.

### Scope of the 500-entry draft

This quota-based editorial pilot tests the content and review process. It is not a
self-contained first-500 course: core verbs, time words, numbers, and colors are
not comprehensively represented. No external lesson that supplies those gaps is
assumed. Release planning must separately establish that coverage before presenting
the pilot as a complete beginner course.

The September 2026 editorial review identified repeated category-only level
rationales. A category is not evidence for an A1 placement. The draft labels must
be validated sense by sense, particularly the flagged science, technology,
government, economics, industry, agriculture, energy, fiction, faith, and philosophy
vocabulary. Do not silently move entries across levels merely to obtain a passing
validator; replacement terms and quota changes require an explicit curriculum
decision. Original learner-friendly wording is also not proof of an official level.

### Grammatical and regional presentation

The draft records grammatical gender independently of whether a lemma contains
spaces. Nominal expressions such as `tiempo libre`, `correo electrónico`, and
`oficina de correos` use NOUN and their normal gender, with stable catalog IDs.
Canonical adjectives retain the existing headword and record useful feminine forms;
important plurals and article constructions belong in `alternativeForms`, rather
than becoming extra counted entries. Feminine `agua` and `hambre` retain feminine
agreement despite singular `el`; `vacaciones` retains its usual plural headword.
Regular paradigms are not exhaustively duplicated. These fields are exposed to the
editorial reviewer; their eventual learner presentation is a production decision.

The first pronunciation locale remains `es-ES`. Spain-preferred vocabulary, such as
`móvil`, may be retained when explicitly documented with useful alternatives such as
`celular`. A regional alternative is evidence for the same intended meaning, not a
new CEFR entry or a reason to silently change pronunciation locale.

### Approved editorial corrections

`assets/catalog/spanish/a1-editorial-corrections.json` records the reconciled
September 2026 Spanish and Slovak AI findings, with before/after fields and reasons.
Owner approval authorizes these draft edits. It does not write native-speaker
decisions or attestations. The original reports remain unchanged; after candidate
edits, their old hashes document the reviewed baseline rather than the new payload.

## Production promotion gate

An asset may change from `draft` to `production` only when:

1. every source and transformation has a recorded release-compatible license,
   version, checksum, attribution, and redistribution scope;
2. every entry has namespaced unique identity, valid normalized term, CEFR evidence,
   POS, original Spanish definition/example, and Slovak hint;
3. a qualified Spanish reviewer approves the lemma, sense, level, definition, and
   example, and a qualified Slovak reviewer approves the hint for that exact sense;
4. disagreements are adjudicated and recorded rather than silently overwritten;
5. deterministic validation passes and each manifest count matches the entries; and
6. release QA confirms the product labels the catalog CEFR-aligned and displays all
   required attribution.

## A1 pilot review rubric

The 500-entry A1 pilot is authored and reviewed outside runtime catalog APIs. Agent or
machine-authored output is always draft and never counts as reviewer approval.

The Spanish reviewer evaluates every immutable candidate for:

- the selected lemma, explicit sense, controlled part of speech, gender/alternative
  forms, and primary curriculum classification;
- defensible A1 usefulness and broadly understood neutral Spanish;
- a concise, non-circular, learner-appropriate original definition;
- a natural original example that expresses the selected sense; and
- exclusion or explicit treatment of regionalisms, proper names, arbitrary
  inflections, and unstable phrase fragments.

The Slovak reviewer independently evaluates every hint for:

- the exact selected Spanish sense rather than the spelling alone;
- natural, correctly spelled Slovak and an appropriate aspect/form where relevant;
- enough specificity to avoid a misleading broader or narrower meaning; and
- absence of untranslated Spanish, copied definitions, or unnecessary explanation.

Each reviewer uses a distinct stable reviewer ID and attests to the relevant language
qualification. Review files bind to the complete candidate SHA-256. Reviewers choose
`approved`, `changes-requested`, or `rejected` and give a note for every requested
change or rejection. They do
not see or edit the other reviewer's decisions while their own review is in progress.

Any content change invalidates the affected decisions. An adjudication records the
before/after value, reason, adjudicator, and date; the corrected entry then requires
fresh approval from both reviewers. A compile command must reject missing decisions,
same-reviewer submissions, stale hashes, requested changes, and unresolved
adjudications.

## Local A1 pilot workflow

### In-app development preview

The owner approved local testing of the corrected 500-word A1 dataset on 2026-09-05.
To enable it, put `EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED=true` in ignored
`.env.local`, then restart the Expo development server. This workspace has that
local opt-in enabled. The flag also requires `__DEV__`; release-mode catalog
lookups remain gated even when the environment flag is true.

Select **Slovak → Spanish** in Settings (or onboarding), then open
**Library → Discover → A1**. Browse/search the 500 words, add chosen entries to
**My words**, and practice them in **Learn** with Spanish definitions/examples,
Slovak hints and the existing Spanish–Spain device pronunciation control. A1 cards
also show grammatical gender and available alternative forms. Words are not
automatically added during onboarding. A2–C2 and Spanish recommendations remain
unavailable; the English recommendation engine is not reused for Spanish.

This preview does not mutate reviewer files or claim native-reviewer approval.
Added words use the existing library storage and account-sync behavior; use a guest
or test account for disposable native-device tests. Web preview word state is
in-memory and resets on page reload. No database migration or cloud build is needed.

Verification: 90 suites / 482 tests passed, including preview-enabled/disabled and
release-mode gates plus adding Spanish identities/hints/locales. Live web QA verified
Library → A1 → add `cabeza` → Learn → reveal `hlava`. Mobile word titles were measured
and fixed to remain one line at 375px; back/add controls measured 44/50px high and
search text 16px. Desktop practice had no page overflow at 1280px. Native-device
audio was not reverified. Expo Doctor still reports the existing five dependency
advisories described in `SPANISH_A1_IMPLEMENTATION_VERIFICATION.md`.

### Editorial source preparation

Download and extract the pinned `omw-es-2.0.tar.xz` and `omw-en-2.0.tar.xz` releases
outside the repository, then generate the lexical-evidence sidecar while verifying
both sources:

```sh
pnpm spanish:a1:sources --archive <path-to-omw-es-2.0.tar.xz> --omw <path-to-omw-es.xml> --english-archive <path-to-omw-en-2.0.tar.xz> --english-omw <path-to-omw-en.xml>
```

Validate the immutable candidates, source manifest, exact quotas, and evidence:

```sh
pnpm spanish:a1:validate --sources assets/catalog/spanish/a1-source-manifest.json --candidates assets/catalog/spanish/a1-candidates.json --evidence assets/catalog/spanish/a1-lexical-evidence.json
```

Prepare independent ignored review packages:

```sh
pnpm spanish:a1:prepare-reviews --sources assets/catalog/spanish/a1-source-manifest.json --candidates assets/catalog/spanish/a1-candidates.json --evidence assets/catalog/spanish/a1-lexical-evidence.json --spanish-output .artifacts/spanish-a1/reviews/spanish-review.json --slovak-output .artifacts/spanish-a1/reviews/slovak-review.json
```

Preparation refuses existing files. After approved content/evidence changes, refresh
only untouched pending packages with:

```sh
node scripts/spanish-a1-pipeline.mjs refresh-reviews --sources assets/catalog/spanish/a1-source-manifest.json --candidates assets/catalog/spanish/a1-candidates.json --evidence assets/catalog/spanish/a1-lexical-evidence.json --spanish-output .artifacts/spanish-a1/reviews/spanish-review.json --slovak-output .artifacts/spanish-a1/reviews/slovak-review.json
```

Refresh preserves reviewer IDs and qualifications and creates unique byte-original
`.backup` files beside both packages. It refuses decisions, notes, sense selections,
attestations, completion dates, changed entry identities, or an active save lock.
Never clear human work to bypass this check; completed or partially reviewed content
requires explicit adjudication and fresh review of the changed payload.

Each reviewer starts a separate local process for only their assigned package. The
server binds to `127.0.0.1`, validates the committed source/candidate/evidence assets
and package hashes before serving, and prints the local URL. Start the Spanish review:

```sh
pnpm spanish:a1:review --review .artifacts/spanish-a1/reviews/spanish-review.json
```

After stopping that process, start the Slovak review separately:

```sh
pnpm spanish:a1:review --review .artifacts/spanish-a1/reviews/slovak-review.json
```

Use the page to search or filter subjects, choose decisions, enter required notes,
and save. Before navigation or a search/filter change, the page automatically saves
unsaved input and proceeds only after success; validation or revision conflicts leave
the reviewer on the same subject with the error visible. Every save is atomic,
revision-checked, and guarded by a package-specific cross-process lock; a stale browser
must refresh instead of overwriting newer work.
Spanish approval requires one offered OMW sense,
or explicit approval of the documented original-editorial exception when no sense is
offered. When no decisions remain pending, the reviewer enters their own truthful
attestation and finalizes. Finalization records a server-generated ISO completion
time, but does not score, compile, publish, or promote the catalog.

Each Spanish source option now carries a readable English WordNet definition,
member lemmas and any examples, plus Spanish descriptions when the pinned Spanish
source supplies them. Source languages are labelled; reference text is not
machine-translated. Duplicate Spanish senses pointing to the same synset form one
option with retained source aliases. The English reference maps by the same WordNet
3.0 offset and equal ILI; only adjective `a` to satellite `s` fallback is allowed.
Reviewers must understand the displayed references to make a meaningful selection.
These descriptions never replace original Wordfold learner text or establish a
CEFR grade. Slovak sessions contain the candidate context and hint, not these
source-sense descriptions or another reviewer's decisions.

After the two reviewers complete their separate files, score them with
`pnpm spanish:a1:score`. Use `pnpm spanish:a1:compile` only with both completed review
files and a resolved adjudication file. Compilation produces a reviewed draft
promotion candidate, not a runtime release; a separate approved promotion task must
still integrate it.

## Original multi-level supplemental drafts (2026-09-05)

The owner-approved expansion has a separate original-content draft lane, documented
in `docs/SPANISH_CATALOG_EXPANSION.md`. It preserves the A1 licensed evidence and
human-review gates above. Supplemental AI assessments bind every entry and exact
input hashes; corrections invalidate coverage and require rechecking. Preview
compilation rejects unresolved, stale or incomplete reports and never emits a
production release. Existing human decisions are not populated from AI records.
All six levels have available preview entries but remain partial; the next 138
enumerated selections and additional unmapped coverage are still unfinished.
