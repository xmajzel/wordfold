# Spanish A1–C2 inventory: first expansion

This is an original, partial Wordfold learning inventory, not every Spanish word,
a completed six-level course, or an official Cervantes vocabulary list. The
machine-readable record is `assets/catalog/spanish/a1-c2-inventory.json`.

| Level | Retained drafts | New authored senses | Explicit next selections | Objectives |
| --- | ---: | ---: | ---: | ---: |
| A1 | 500 | 81 | 43 | 6 |
| A2 | 0 | 24 | 20 | 4 |
| B1 | 0 | 22 | 20 | 4 |
| B2 | 0 | 19 | 15 | 3 |
| C1 | 0 | 20 | 20 | 4 |
| C2 | 0 | 19 | 20 | 4 |

The 185 new senses are in `expansion-candidates.json`. The 138 next selections
are not yet authored, and some explicitly require comparison with existing senses
before a new ID is minted. Counts result from enumerated objectives and senses,
not copied English quotas. Further topics remain unmapped; 138 is not a claim of
the total remaining work.

## Placement method

The [PCIC basic objectives](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/01_objetivos_relacion_a1-a2.htm)
inform our progression from personal information and immediate needs to routine
service exchanges. We prioritize missing core predicates, calendar sets, quantities,
function words and social formulas alongside the existing topical vocabulary.

The [PCIC intermediate objectives](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/01_objetivos_relacion_b1-b2.htm)
inform the transition from connected experiences and practical problem-solving to
structured argument and professional negotiation.

The [PCIC advanced objectives](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/01_objetivos_relacion_c1-c2.htm)
inform precision, implicit meaning, register and idiomatic interpretation. Our C1/C2
selections are practice placements, not assertions that a word first appears at
that level. Several rationales explicitly flag overlap with lower levels.

The [Council of Europe](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions)
defines a proficiency framework through can-do descriptions. Vocabulary counts
alone cannot establish proficiency. These are independent Wordfold applications
of the framework: no PCIC definitions, examples or bulk lexical lists were copied.

## Identity, review and remaining work

- Retain all 500 A1 IDs. Their existing category-template rationales still need
  individual placement adjudication; they are not credited as validated functional
  coverage merely because their topic labels match.
- Keep the six prototype fixtures separate. In particular, the prototype `pie`
  must not create a duplicate of the existing A1 entry without a sense decision.
- Each expansion sense has original Spanish text, a Slovak hint, morphology,
  register, a specific placement rationale and objective references. The first
  authoring pass is AI-authored. Independent Spanish and Slovak AI reviews must
  bind current hashes; neither is a native-speaker or audio attestation.
- The historical authoring hash in the inventory is not a current review hash.
  Current review packages govern eligibility after any correction. Pre-review
  surface correction recorded: `En virtud de` → `En virtud del` in the contracted
  example, without changing its stable identity.
- Author planned senses in objective-sized batches, resolve duplicate/sense
  questions first, validate, review independently, correct and re-review before
  development-preview exposure. Production remains separately gated.
- Remaining gaps include systematic coverage of the 20 topical classifications,
  broader function-word and number systems, regional variants, sense progression,
  and all non-vocabulary skills. No level is marked complete.

Verification: `pnpm exec jest --runInBand src/features/content/spanish-inventory.test.js`
and `node scripts/spanish-expansion-pipeline.mjs validate`.
