# Spanish expansion: independent AI text review

Reviewer: `expansion-spanish-agent` (AI, not a native-speaker or human attestation). Reviewed on 2026-09-05 independently of the authoring agent. All 185 entries were read for Spanish definition, example, selected sense, part of speech, morphology, register, and plausibility of the explicitly provisional placement. No audio was reviewed.

Coverage: A1 81, A2 24, B1 22, B2 19, C1 20, C2 19. This is a partial expansion, not a complete A1–C2 curriculum. The final machine-readable review contains 185 entry-specific notes, exact entry hashes and the dataset hash. All 185 final decisions are `no-issue` after the two required corrections below were re-inspected. This decision does not certify CEFR placement or authorize production publication.

## Required findings, now resolved

Initial inspected canonical dataset: `95f811bd9879ee8038a957d58a47948ec89db0b06da2f691511f50d4c0fc8d0d`.

1. `es-sk:a2:exp-005-ida-y-vuelta`: the bare nominal phrase **ida y vuelta** did not match its adjectival definition, ADJ tag and ticket-qualifier hint. Include **de** in `term`, `normalizedTerm` and `exampleSurfaceForm`; label `displayPartOfSpeech` as **locución adjetiva**. The existing natural example, definition and stable IDs can remain. This is an editorial grammatical inference from the actual example, not a claim that the dictionary assigns this whole phrase an official level. [RAE's entry for ida](https://dle.rae.es/ida) confirms the underlying noun category.
2. `es-sk:b2:exp-013-concienciar`: `definition` incorrectly required that the person subsequently act. Replace it with the original wording **Ayudar a que una persona comprenda la importancia de un problema.** Awareness need not entail action. The regional alternative **concientizar** is valid. [FundéuRAE on concientizar](https://www.fundeu.es/consulta/concientizar-2467/) supports the awareness sense; [RAE on the two forms](https://www.rae.es/duda-linguistica/es-concienciar-o-concientizar) supports the regional alternative.

The root integrator also corrected `en virtud de`'s matching surface to **En virtud del** before binding this review; the example correctly contracts **de + el**. The two corrected Spanish entries were inspected at canonical hash `b2924287226e54bcfe198cb8669489fe41f4c3c6cd0c76c7a8b879c370481908`.

Subsequent Slovak-review refinements to **sostener**, **pertinente**, and **incumbir** were re-inspected against their unchanged Spanish senses and remain aligned. Final inspected canonical dataset: `866f9e478e8134c34bd591bc654d5f72a83187ce052d4a9c8a93be9ff5d0c552`.

## Placement and teaching limits

The sequence is plausible as an initial teaching sequence: foundational forms at A1, routine transactions at A2, connected narrative and practical repair at B1, argumentation at B2, qualification/synthesis at C1, and pragmatic nuance at C2. These are editorial judgments about the selected tasks, not exclusive word-level boundaries. Several upper-level expressions can be encountered and learned earlier; a single flashcard cannot establish sophisticated discourse or pragmatic mastery. All placements must remain provisional.

Beginner Spanish definitions necessarily use some explanatory vocabulary beyond the target. The Slovak hint supports comprehension, but scaffolded grammar practice is still needed, especially **ayer fue**, pronoun omission, **usted/ustedes** regional choices, article exceptions, and irregular forms. The **cero** seat-number example is grammatical but less typical than a telephone-number context; not a blocking semantic error. The initial finite sets do not imply the complete foundational inventory has been covered. [PCIC A1–A2 grammar inventory](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/02_gramatica_inventario_a1-a2.htm) was consulted as framework context, not copied as learner content.

No remaining mandatory Spanish text defect was found in this review. Human editorial judgment, regional and pronunciation listening checks, and full objective coverage remain separate work.

## Revision 2: adjective metadata correction

The root integrator's subsequent UI self-review caught a metadata error missed by the initial Spanish review: all 16 expansion adjectives used `gender: not-applicable`, inconsistent with the catalog convention and their displayed agreement. The initial review is preserved verbatim as `assets/catalog/spanish/reviews/expansion-spanish-review-r1.json`; this addendum does not claim the initial pass caught the problem.

All 16 adjectives were re-inspected. The citation forms **rojo, amarillo, blanco, negro, fidedigno, tácito** are now `masculine`, with their valid feminine alternatives retained. **Azul, verde, de ida y vuelta, urgente, mejor, peor, sostenible, viable, pertinente, fehaciente** are now `invariant` in gender. For single-word adjectives this does not imply invariance in number; **de ida y vuelta** is a fixed phrase unchanged in either gender or number.

Verification compared every entry with revision 1: 169 entry hashes are exactly unchanged; reverting only `gender` to its old value reconstructs the revision-1 hash for each of the 16 corrected adjectives. Thus no unrelated candidate changes were silently re-approved. The current review retains the 185 original entry-specific notes and adds explicit revision-2 morphology notes to the 16 affected entries.

Revision-2 canonical dataset: `c1de4e30998438fef7213afca6d82503e62fa4ea2378f8b9ca9bfba4f3912591`. AI-only status, provisional placements, partial curriculum scope, and the absence of pronunciation listening review are unchanged.
