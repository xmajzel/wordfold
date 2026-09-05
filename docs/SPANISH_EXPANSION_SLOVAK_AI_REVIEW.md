# Independent Slovak-perspective AI review — 2026-09-05

Reviewer: `expansion-slovak-agent` (AI, not a native-speaker attestation). The agent
implemented UI earlier but did not author these entries. This pass independently
read all 185 selected Spanish senses, definitions, examples, forms and Slovak hints
in two complete nontruncated groups, then wrote an individual Slovak note for every
entry. It is not an audio review, CEFR certification or human approval.

## Initial findings retained

Initial review input canonical SHA-256:
`b2924287226e54bcfe198cb8669489fe41f4c3c6cd0c76c7a8b879c370481908`.
No blocking wrong-sense translations were found. Three nonblocking naturalness
refinements were sent to the main agent and subsequently adopted by that agent:

| Entry | Initial hint | Adopted refinement | Reason |
| --- | --- | --- | --- |
| `es-sk:b2:exp-005-sostener` | zastávať; tvrdiť (názor) | zastávať názor; tvrdiť | Avoids the awkward collocation tvrdiť názor. |
| `es-sk:c1:exp-015-pertinente` | relevantný; vecne príslušný | relevantný; týkajúci sa veci | Avoids suggesting legal jurisdiction when discussing relevant information. |
| `es-sk:c1:exp-017-incumbir` | prislúchať; patriť do zodpovednosti | prislúchať; byť v kompetencii | More natural Slovak wording for a committee's responsibility. |

The first equivalents were already accurate; these were editorial refinements,
not evidence that the initial entire batch was mistranslated. Rechecked all three
changed hints against their original Spanish senses before final hash binding.
Also checked that the Spanish-side corrections to `de ida y vuelta` and
`concienciar` preserve alignment with `spiatočný (lístok)` and
`zvyšovať povedomie; viesť k uvedomeniu` respectively.

## Final result

185/185 entries have specific notes, `decision: no-issue`, no unresolved findings,
the exact entry hash, level and sense identity. Coverage by level: A1 81, A2 24,
B1 22, B2 19, C1 20, C2 19. No candidates were edited by this reviewer.

Final dataset canonical SHA-256:
`866f9e478e8134c34bd591bc654d5f72a83187ce052d4a9c8a93be9ff5d0c552`.
Raw file SHA-256 supplied and checked by the main agent:
`1a1bc74e583762a455ca79eba9a0dd824f7a67762f22465870265d95e618f7ca`.

Review JSON: `assets/catalog/spanish/reviews/expansion-slovak-review.json`.
Created using the pipeline's `createAIReviewTemplate`, with explicitly AI identity
and `notHumanApproval: true`; verified using `validateAIReview` with
`requireResolved: true`.

## Targeted source checks and limitations

The selected meaning of pertinente was checked against the [RAE DLE entry](https://dle.rae.es/pertinente).
The evidential nuance of fehaciente was checked against the [RAE DLE entry](https://dle.rae.es/fehaciente);
its longer Slovak qualifier preserves a nuance that presvedčivý alone would miss.
These are reference checks, not bundled dictionary text. A Slovak dictionary portal
request was unavailable; the Slovak wording judgments above are the AI reviewer's
linguistic assessments, not attributed to that portal. Complete native editorial
review, level validation and listening tests remain separate gates.

## Metadata-only r2 addendum — 2026-09-05

The original exact review is retained in `expansion-slovak-review-r1.json`.
The main agent corrected the Spanish gender metadata of 16 adjectives to match
the repository convention. Independently rechecked all 16 against their Slovak
hints: six masculine citation forms (rojo, amarillo, blanco, negro, fidedigno,
tácito) and ten forms invariant by gender (azul, verde, de ida y vuelta, urgente,
mejor, peor, sostenible, viable, pertinente, fehaciente). These changes do not
require changing the Slovak masculine citation equivalents. Invariant here concerns
gender only, not grammatical number.

Programmatic comparison verified all 169 other entry hashes unchanged. For each
of the 16 changed entries, restoring only the former `not-applicable` gender value
reproduced the exact r1 entry hash. Thus hints, learner text and identities were
unchanged. All 185 existing assessments were preserved; the 16 adjective notes
received an explicit metadata-recheck addendum.

Final r2 canonical dataset SHA-256:
`c1de4e30998438fef7213afca6d82503e62fa4ea2378f8b9ca9bfba4f3912591`.
Raw dataset SHA-256 supplied by main:
`efb38afe1a97ddeb34e34aeeb1e20f0fdf80ba586ebd20aa77b1bb52330ddcf4`.
The review at the original filename is now bound to r2, still explicitly AI-only.
