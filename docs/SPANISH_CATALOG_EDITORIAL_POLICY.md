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
