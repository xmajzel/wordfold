# Complete Spanish vocabulary catalog: batch plan

Status: execution plan approved by the owner's "implement" reply, 2026-09-05.
Level planning is complete; sense-selection implementation is starting. Exact
frozen inventory acceptance, full learner-text authoring and production remain
later stages, not outcomes already achieved.

## What “complete” means

Complete **Wordfold Spanish vocabulary v1** means every sense in an agreed,
versioned A1–C2 inventory is authored, reviewed and usable, and every declared
coverage objective has an explicit disposition. It does not mean every Spanish
word, full CEFR proficiency from flashcards, or Cervantes certification.

A deferred required objective blocks completion. An exclusion needs independent
coverage review and a genuine scope reason, not a way to conceal missing work.
Recommended owner decision: displayed level means recommended introduction of
the selected sense/construction, not any later practice context. Existing
practice-context placements need explicit adjudication under that decision.

PCIC supplies the reference framework; Wordfold supplies original selections and
learner text. We use level-specific columns and contextual evidence, not a topic
name or rarity as proof of level. A lower-level word may have a distinct advanced
sense; a harder example alone does not justify another entry.

## Baseline: accounted for, not counted as complete

| Level | Current local-preview entries | Previously selected next senses |
| --- | ---: | ---: |
| A1 | 581 | 43 |
| A2 | 24 | 20 |
| B1 | 22 | 20 |
| B2 | 19 | 15 |
| C1 | 20 | 20 |
| C2 | 19 | 20 |
| Total | 685 | 138 |

The 685 comprise 500 legacy A1 records and 185 supplemental entries. Six prototype
fixtures are separate and must not silently add duplicates. All 138 next selections
must be accepted, merged into an existing sense, moved with evidence, or excluded
with a reason. They are inputs, not the final remaining-work count.

The 500 legacy entries need individual placement decisions, replacing generic
category rationales. Preserve their IDs and history even where placement is
challenged. Current AI review of the supplement is useful evidence, not proof of
complete objective coverage or native review.

## Stage 1 — six level planning batches

One assigned agent job per level, executed in waves; agent sessions may be reused.
There are three subagent slots while the root coordinates. At first, two research
workers handle A1/A2/B1 and B2/C1/C2 as separate level tasks, while the third fixes
inline progress. Planning deliverables are not learner-content authoring batches.

Each level has these eight packages: **48 coverage cells** in total. The grouping
is an original Wordfold work breakdown, not a PCIC word-count standard.

| Code | Coverage package | PCIC specific-notion domains / other scope |
| --- | --- | --- |
| F | Foundations and general notions | Existence, quantity, space, time, quality, evaluation, mental notions; lexical grammar, numbers, pronouns, determiners, prepositions, core verbs |
| P | People and health | 1, 2, 3, 4, 13: body, mind, identity, relationships, health/hygiene |
| H | Home, food and buying | 5, 10, 12: food, housing, shopping |
| T | Travel and public services | 11, 14: services, transport, accommodation and travel |
| W | Education, work and technology | 6, 7, 16: study, employment, science/technology |
| C | Culture, leisure and media | 8, 9, 18: leisure, communication/media, arts |
| S | Society and the natural world | 15, 17, 19, 20: economy/industry, civic life, beliefs/philosophy, geography/nature |
| D | Communicative functions and discourse | Information, opinions, feelings, influence, social relations and discourse organization; pragmatics, register, idioms and multiword language |

F and D cross-reference topical entries rather than duplicating them. Every
applicable subcategory gets an objective and selected senses; a subcategory not
appropriate at that level gets an evidence-backed disposition. Do not invent
equal quotas for topics, force advanced institutions into A1, or mark a broad
domain complete because it has one example.

| Level | Intended progression | Planning task |
| --- | --- | --- |
| A1 | Basic identity, immediate needs, concrete everyday situations, finite foundational sets | plan-spanish-a1-complete-coverage-batches |
| A2 | Routine transactions, everyday descriptions, simple plans and practical problems | plan-spanish-a2-complete-coverage-batches |
| B1 | Connected experiences, explanations, opinions and independent everyday problem-solving | plan-spanish-b1-complete-coverage-batches |
| B2 | Developed arguments, audience-sensitive explanations and practical negotiation | plan-spanish-b2-complete-coverage-batches |
| C1 | Precise extended discourse, stance, implication and flexible formal/informal choice | plan-spanish-c1-complete-coverage-batches |
| C2 | Fine sense distinctions, idiomatic interpretation, rhetorical effects and register precision | plan-spanish-c2-complete-coverage-batches |

The individual agent reports provide all 48 concrete cell scopes, original
representative seeds and boundary criteria:
[A1–B1](SPANISH_CATALOG_PLAN_A1_B1.md) and
[B2–C2](SPANISH_CATALOG_PLAN_B2_C2.md).
Seed lists are illustrative and intentionally subject to cross-level adjudication.

## Stage 2 — enumerate, adjudicate and freeze

After plan approval, each of the 48 cells receives a sense-selection worker.
Output: objective IDs, explicit lemma/POS/sense gloss, proposed level, own
rationale, framework references, existing-ID match, inclusion decision, register,
regional scope, phrase/form notes and uncertainties. Do not copy PCIC lexical
inventories wholesale. Illustrative seeds in research are not an exhaustive list.
Reference keys must include framework inventory/section as well as category ID:
bare category 5 cannot distinguish specific-notion food from section 5 functions.

First reconcile existing IDs and the 138 next selections. Then enumerate missing
senses for every objective, including closed sets (calendar, pronouns, number
patterns) and their explicit bounds. Number composition is a learning rule, not
an infinite word enumeration; morphology is normally a form of a sense, not a new
headword. For open categories, list chosen communicative scenarios and selected
lexical contrasts, and have an independent coverage reviewer challenge omissions.

Run global cross-level/same-level deduplication before minting IDs. Distinguish
same lemma with different meanings from variants/inflections of one meaning.
Record keep/merge/exclude/relevel decisions; changes affecting saved progress need
a compatible lookup/alias strategy before integration, not deletion of old IDs.

Freeze inventory version, exact unique counts by level/package and input hashes.
Owner accepts the explicit inventory. At that point we can give a defensible
final total; **neither 823 nor a guessed round target is currently that total**.
Changing the frozen scope creates a new version and invalidates affected reviews.

## Stage 3 — bounded authoring and independent review

Split each package's new/rewrite senses deterministically by stable sense key into
**at most 50 senses** per authoring shard. IDs: ES-V1-{level}-{package}-{001...}
are shard IDs, never replacements for existing catalog entry/sense IDs.
50 is a review workload limit, not a vocabulary quota. Final author-batch count is
the sum of ceil(new/rewrite senses in each nonempty package / 50), calculated only
after freeze. Empty/inapplicable cells have reviewed dispositions, not fake batches.

Every shard gets this dependency chain:

1. AUTHOR: one agent owns its shard only; original Spanish and Slovak content.
2. VALIDATE: schema, identity, counts, objective mapping and exact example surface.
3. REVIEW-ES and REVIEW-SK: two agents independently inspect every entry against the
   same immutable input. Neither reviewer is the author for that shard.
4. CORRECT: resolve both findings with a reversible ledger. Unresolved disputes
   block the shard; corrections trigger affected reviews against new hashes.
5. INTEGRATE: controller checks exact coverage, global duplicates and regression
   results. Only then add a validated shard to the allowed preview/release lane.

With three worker slots: author A while two independent agents review earlier B,
then rotate roles without self-review. Reviewers identify themselves as AI;
they never sign for jozef-sk or annamariea-es. A queued job is not a running agent.

Existing records also need final-inventory coverage. The 500 legacy A1 records can
be audited in ten fixed 50-entry input chunks; the 185 supplemental records in
four chunks (50/50/50/35). These are audit chunks, not extra catalog entries or a
replacement for level/package ownership. Current review evidence may be reused
only where exact content hashes and the reviewed scope still match.
Unchanged records take the audit/review lane rather than being unnecessarily
reauthored. Changed placement metadata still needs review of that changed scope.

The board contains 48 individual select-spanish-* tasks, each with one worker
owner when dispatched. Their dependencies are level planning → owner plan
approval → cell sense selection → global adjudication/freeze. Author/ES/SK/
correction/integration tasks are materialized from frozen shard membership,
so we do not pretend to know the final author-batch count today.

## Required entry and review contract

- Stable entry/sense identity; normalized Spanish term; course and level.
- Original sense-specific Spanish description, natural example and exact term
  surface; clear Slovak hint that matches that meaning rather than a vague synonym.
- POS, gender, plural/irregular forms, reflexive status, phrase status, relevant
  prepositions/collocations, register and regional notes where needed.
- Entry-specific level rationale and objective/framework references, uncertainty
  resolved or explicitly blocking; author/source versions and original-text record.
- Exact es-ES pronunciation term/phrase routing; written accent and stress review,
  difficult sound/phrase checks and explicit device-audio test selection.
- Per-entry reviewer decisions and meaningful notes, findings/corrections, exact
  batch and entry hashes, reviewer type and no unresolved required corrections.

Do not add new learner UI fields silently: if an approved metadata field is not
displayed yet, preserve it editorially and specify the UI change separately.

## Pronunciation is a separate release gate

Text review checks accents, forms, homographs and phrase boundaries for every
entry. Maintain a risk-stratified audio set across all levels: r/rr, j/g, c/z,
stress contrasts, vowel sequences, clitics, reflexives and longer phrases.
Use existing exact es-ES device routing, not English neural voices or an automatic
es-MX fallback. Test missing voice, playback failure, cache and offline behavior
without making an untested offline guarantee.

Physical Android/iOS and native-speaker listening evidence remain required under
the existing launch policy. Follow docs/SPANISH_DEVICE_PRONUNCIATION_QA.md.
AI written review is not listening evidence. No paid synthesis or EAS build is
authorized by this plan.

## Stage 4 — public-build readiness, then publication

This is a separate dependency, not “hide Local preview”:

1. All frozen inventory objectives and final review coverage pass.
2. Owner resolves the proposed release-policy amendment: truthful AI editorial
   review plus owner acceptance, or actual native signoff. Preserve historic human
   packages in either case; do not fabricate approval.
3. Compile a production manifest with exact counts, original/licensed sources,
   inventory/review hashes, policy decision, corrections and attribution.
4. Normal builds load the compiled catalog without development flags. Only then
   remove preview notices for that catalog on onboarding, ready, Settings, Library
   and level screens. Keep future drafts gated.
5. Verify all existing course features below. Native/audio launch gates still
   apply. Remote deployment or store submission needs its own target/approval.

## Feature and regression acceptance

| Feature | Required observable result |
| --- | --- |
| Course picker/onboarding/Settings | Correct language, actual level counts, explicit switch confirmation, no stale preview notice for production asset |
| Library/level progress | Inline count-label units, honest totals, known/learning/added/remaining arithmetic, narrow and large-text layout |
| Discovery/search | Every frozen sense resolves by ID and intended term/form; accents, phrases and homographs tested at all six levels |
| Add/study/translation | Correct Spanish description/example and Slovak hint; add limits, duplicate prevention and study behavior unchanged |
| Pronunciation | Exact es-ES path, missing-voice guidance, failure recovery and representative physical listening checks |
| Persistence/course isolation | Existing IDs/progress survive expansion and course switch; English and Spanish never mix through matching terms |
| Manual vocabulary/import | Existing manual creation, editing, import and unknown terms remain usable |
| Build/release | Production asset exposed without preview flag, drafts excluded, reproducible counts/hash coverage and source notices |

Run content/pipeline tests, full Jest, TypeScript, lint, Expo Doctor and a local
production export. Check English regressions and all-level add/search/study.
Record failures and environment limitations honestly; no cloud EAS build.

## Sources and reuse limits

Framework checked 2026-09-05: [PCIC index](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/indice.htm),
including objectives, general/specific notions, functions, grammar and prosody.
Use the linked level-specific inventories to verify category applicability.
[CEFR level descriptions](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions)
describe proficiency rather than setting a finite Wordfold word count.

The owner's supplied Cervantes permission supports framework organization and
acknowledgment, not bulk protected learner text or endorsement. Existing permission
evidence remains redacted. Do not copy names/logos as certification.
