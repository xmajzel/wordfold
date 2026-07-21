# Pronunciation Phase 3A: single-reviewer provisional decision

Approved by the product owner on 2026-07-21. This decision allows engineering work to continue
with limited evidence; it does not satisfy the production pronunciation-quality gate.

## Evidence

- Canonical local ratings: `.artifacts/pronunciation-bakeoff/reviewer-azure-1/ratings.json`
- SHA-256: `591b584f1fa0e6eca8460ac3ab86e431c02576a67c00eae89bb30fb9ad525cd4`
- Reviewer: `jozef`, a native Slovak and English speaker.
- Coverage: 180 unique blinded samples: 60 each for `sk-SK`, `en-US`, and `en-GB`.
- The desktop exports are cumulative snapshots. `ratings-jozef-en-GB.json` is byte-identical to the
  canonical 180-rating file; the `en-US` and original exports are exact 120- and 60-rating subsets.
- Result: 178 acceptable, 2 unacceptable, 0 wrong-locale, and 0 noted ratings.

The unchanged scorer reports `fullyRatedSamples: 0`, `evaluationComplete: false`, and
`canRecommend: false` because every sample has only one reviewer. That behavior is intentional.

## Per-voice result

| Locale | Voice | Acceptable | Wrong locale | Mean generation latency |
|---|---|---:|---:|---:|
| `en-US` | `en-US-AvaNeural` | 30/30 | 0 | 170 ms |
| `en-US` | `en-US-AndrewNeural` | 30/30 | 0 | 373 ms |
| `en-GB` | `en-GB-RyanNeural` | 30/30 | 0 | 145 ms |
| `en-GB` | `en-GB-SoniaNeural` | 30/30 | 0 | 385 ms |
| `sk-SK` | `sk-SK-ViktoriaNeural` | 29/30 | 0 | 158 ms |
| `sk-SK` | `sk-SK-LukasNeural` | 29/30 | 0 | 182 ms |

Both Slovak voices were rejected only for `sk-SK-phrase-04`, `Strč prst skrz krk.`, a phrase
testing syllabic consonants. This is a shared difficult-item failure, not evidence that one Slovak
candidate is better than the other.

## Provisional selections

- `en-US`: Azure `en-US-AvaNeural`
- `en-GB`: Azure `en-GB-RyanNeural`
- `sk-SK`: Azure `sk-SK-ViktoriaNeural`

Pronunciation ratings were tied within each locale, so lower observed mean generation latency is
used only as a deterministic engineering tie-break. One screening run is not a reliable latency
benchmark and does not show that the selected voice has better pronunciation.

`de-DE`, `el-GR`, `es-ES`, and `es-MX` remain unreviewed and have no provisional selection.

## Guardrails

- These are `single_reviewer_provisional` selections, never production-approved recommendations.
- The two-independent-native-reviewer, 200-item, 95%-acceptable, zero-wrong-locale release gate
  remains unchanged.
- Product copy must say `Neural voice preview`, not native, perfect, correct, or reference-quality.
- Phase 3B may build local/test infrastructure for the three selections, but production rollout
  remains gated by budget ownership, provider/legal review, full-corpus evidence, and explicit
  deployment approval.
- The existing public catalog contains English source terms only. `sk-SK` is selected for future
  use but cannot be exposed through public-catalog playback until Wordfold has an approved public
  Slovak catalog or separately approves target-translation pronunciation. Personal Slovak words
  remain device-only.

## Reproduce the conservative score

```bash
pnpm pronunciation:bakeoff score \
  --input .artifacts/pronunciation-bakeoff/reviewer-azure-1 \
  --key .artifacts/pronunciation-bakeoff/private/azure-1-key.json \
  --ratings .artifacts/pronunciation-bakeoff/reviewer-azure-1/ratings.json
```

The expected result still has `canRecommend: false` and no production `recommendations`.
