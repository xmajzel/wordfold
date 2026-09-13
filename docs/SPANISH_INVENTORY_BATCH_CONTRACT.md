# Spanish sense-selection batch contract v1

Implementation detail of the approved complete-catalog plan. Inventory proposals
are not production assets and are never imported by the application. Each worker
owns only assets/catalog/spanish/inventory-v1/batches/{LEVEL}-{PACKAGE}.json.
Use apply_patch. Do not overwrite another worker's file or current candidates.

## Document shape

```json
{
  "schemaVersion": 1,
  "batchId": "A1-F",
  "courseId": "es-sk",
  "level": "A1",
  "package": "F",
  "status": "proposed",
  "author": "AI worker identifier",
  "levelMeaning": "recommended-sense-introduction",
  "references": [
    {"id":"pcic-general-basic","url":"https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/08_nociones_generales_inventario_a1-a2.htm","section":"8 general notions; A1 column","use":"Framework only; original Wordfold sense selection, not official word placement"}
  ],
  "objectives": [
    {"id":"A1-F-location","description":"Identify near and distant locations in a short exchange.","frameworkSections":["8.3 spatial notions"],"referenceIds":["pcic-general-basic"],"disposition":"selected","rationale":"Basic location contrasts support immediate needs."}
  ],
  "selections": [
    {"id":"A1-F-001","term":"aquí","partOfSpeech":"ADV","sense":"at the speaker's present location","proposedLevel":"A1","action":"select-new","existingEntryIds":[],"plannedSelectionIds":[],"objectiveIds":["A1-F-location"],"levelRationale":"A deictic location answer usable in a short immediate-needs exchange.","lowerLevelContrast":"First introduction of this spatial contrast.","register":"neutral","region":"pan-Hispanic; es-ES audio","formNotes":"Invariable; no gender or plural.","pronunciationNotes":"Written accent marks final stress; final vowel sequence needs checking.","referenceIds":["pcic-general-basic"],"uncertainties":[]}
  ],
  "exclusions": [
    {"subject":"unbounded integers","reason":"Select a bounded compositional number system, not every integer as a separate sense.","objectiveIds":[]}
  ],
  "coverageNotes": ["Selected examples are original. Framework citations are not word-level certification."],
  "counts": {"selections":1,"objectives":1}
}
```

The example illustrates schema only, not an approved candidate or complete F
inventory. Reference IDs and strings above may be replaced with actual checked
references. Cite framework inventory/section and level column, not bare category
numbers that collide across functions and topical notions.

## Required semantics

- Packages F/P/H/T/W/C/S/D and six levels use the approved master map.
- UD POS values: ADJ, ADP, ADV, AUX, CCONJ, DET, INTJ, NOUN, NUM, PART, PRON,
  PROPN, SCONJ, VERB. Multiword expressions take their syntactic POS.
- selection.id is local inventory identity only; preserve any existing catalog
  ID in existingEntryIds. Do not mint replacement globally published IDs.
- action: select-new, retain-existing, propose-relevel, cross-reference, exclude.
  Existing IDs must resolve against the 500+185 baseline (six fixtures are separate
  reference inputs). New senses of an existing lemma can be select-new with an
  existingEntryIds link and an explicit different-meaning rationale.
- proposedLevel is the judged introduction level, even if it differs from the
  owning batch. Such proposals require an uncertainty/decision note until global
  adjudication; no runtime releveling occurs here.
- plannedSelectionIds use exact IDs from a1-c2-inventory.json. Every relevant next
  selection must be accounted for, including reject/merge/relevel proposals.
- Objectives: selected, existing, prerequisite, not-applicable, deferred-core.
  selected/existing requires a selection link through objectiveIds. Prerequisite
  must name lower-level coverage or an unresolved prerequisite explicitly.
  deferred-core always prevents a completion claim. No padding by one-example
  coverage or invented exclusions to reach a target.
- Every selection has its own meaning-level rationale, lower-level contrast,
  morphology/usage and pronunciation notes. Shared reference metadata is fine;
  generic category rationale copied over every entry is not sufficient.
- Crosslinks and uncertain proposed matches are not net-new counts. counts in a
  batch are row counts only. Final unique totals require global adjudication.
- Enumerate the useful lexical contrasts for every scenario in the approved cell,
  beyond illustrative seeds; no arbitrary 50-entry selection cap. 50 limits later
  authoring/review workloads, not inventory size.
- Treat existing A1 category IDs only as a starting ownership map. Review all
  relevant existing meanings individually; their topic alone does not prove level.
- Original sense glosses, no bulk copying PCIC lexicons/definitions/examples.
  No fabricated native signoff, no audio-listening claims from written review.

## Validation / handoff

Scenario matrix for the validator task (local Node/Jest, no real API):

| ID | Input state | Expected result |
| --- | --- | --- |
| INV-001 | Well-formed proposed batch and known baseline references | Structural validation succeeds; not automatically freeze-ready |
| INV-002 | Missing/invalid required field, enum, count, POS or local link | Validation rejects with actionable field/row identity |
| INV-003 | Unknown existing/planned ID or duplicate local meaning/ID | Validation rejects; exact baseline identities stay intact |
| INV-004 | Partial set of valid batch files | Coverage report lists missing cells and uncovered baseline/next selections |
| INV-005 | Same lemma/POS across cells or a proposed relevel | Report raises adjudication work, not an automatic merge or level rewrite |
| INV-006 | Missing cell, deferred core, uncertainty or unresolved duplicate | Freeze/readiness check fails closed |
| INV-007 | Baseline learner assets and runtime before/after inventory work | Files and current published/preview behavior stay unchanged |

The validator will check schema, enumerations, nonempty required strings, identity
and reference links, row counts, baseline/planned references, and local duplicates.
A coverage report will list present/missing cells, baseline and planned coverage,
cross-cell lemma/POS collisions, proposed relevels and unresolved uncertainties.
Structural pass is NOT editorial completion or permission to publish.

Global freeze must reject missing cells, uncovered baseline/planned records,
unresolved collisions/relevels/uncertainties and deferred core objectives. It must
also record independent coverage adjudication and later exact-inventory acceptance.
Do not mark batch tasks done before executable validation and controller review.
