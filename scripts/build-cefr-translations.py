#!/usr/bin/env python3
"""Generate the committed, sense-aware English-to-Slovak CEFR hint sidecar."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

MODEL_ID = "cstr/madlad400-3b-ct2-int8"
MODEL_REVISION = "fd0b55729c074372eb84b52b9309a00dc65c40c4"
MODEL_LICENSE = "Apache-2.0"
DEFAULT_CATALOG = Path("assets/catalog/cefr-catalog.json")
DEFAULT_OUTPUT = Path("assets/catalog/cefr-translations-en-sk.json")
DEFAULT_OVERRIDES = Path("assets/catalog/cefr-translations-en-sk-overrides.json")
ENGLISH_FRAGMENT = re.compile(
    r"\b(the|with|without|from|into|that|which|someone|something|having|being|used|person|region|created|purpose|substantive|noun|verb|adjective|adverb)\b",
    re.IGNORECASE,
)
POS_LABEL = r"(?:substantive|noun|verb|adjective|adverb|substantívum|podstatné meno|sloveso|prídavné meno|príslovka|príslovie)"
TRAILING_CONNECTOR = re.compile(
    r"\s+(?:a|aj|ale|alebo|ako|bez|či|do|k|ku|na|nad|o|od|pod|po|pre|pri|s|so|v|vo|z|za|zo|že|ktorý|ktorá|ktoré|ktorí)$",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES)
    parser.add_argument("--model-path", type=Path)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--checkpoint-batches", type=int, default=5)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def stable_catalog_hash(entries: list[dict[str, object]]) -> str:
    source = [
        {
            "id": entry["id"],
            "term": entry["term"],
            "partOfSpeech": entry["partOfSpeech"],
            "definition": entry["definition"],
        }
        for entry in entries
    ]
    serialized = json.dumps(source, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def load_existing(path: Path, force: bool) -> tuple[dict[str, str], set[str]]:
    if force or not path.exists():
        return {}, set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    generator = payload.get("generator", {})
    if generator.get("model") != MODEL_ID or generator.get("revision") != MODEL_REVISION:
        raise RuntimeError("Existing translations use a different generator; pass --force to replace them.")
    translations = {
        key: value.strip()
        for key, value in payload.get("translations", {}).items()
        if isinstance(value, str) and value.strip()
    }
    fallbacks = set(payload.get("qa", {}).get("definitionFallbackIds", []))
    return translations, fallbacks


def load_overrides(path: Path) -> dict[str, str]:
    raw_payload = json.loads(path.read_text(encoding="utf-8"))
    payload = raw_payload.get("translations", raw_payload) if isinstance(raw_payload, dict) else raw_payload
    if not isinstance(payload, dict):
        raise RuntimeError("Translation overrides must be a JSON object keyed by catalog entry id.")
    return {key: value.strip() for key, value in payload.items() if isinstance(value, str) and value.strip()}


def normalize_letters(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def is_untrustworthy_headword(source: str, candidate: str) -> bool:
    source_key = normalize_letters(source)
    candidate_key = normalize_letters(candidate)
    if not candidate_key:
        return True
    if source_key == candidate_key or source_key in candidate_key:
        return True
    if len(source_key) >= 5 and SequenceMatcher(None, source_key, candidate_key).ratio() >= 0.72:
        return True
    return False


def contains_english_fragment(value: str) -> bool:
    return bool(ENGLISH_FRAGMENT.search(value))


def finalize_hint(value: str) -> str:
    original = value.strip(" .,:;–—-)")
    hint = original
    while hint.count("(") > hint.count(")"):
        hint = hint.rsplit("(", 1)[0].strip(" .,:;–—-")
    while len(hint.split()) >= 8 and TRAILING_CONNECTOR.search(hint):
        hint = TRAILING_CONNECTOR.sub("", hint).strip(" .,:;–—-")
    return hint or original


def clean_hint(source: str, value: str) -> str:
    hint = value.strip()
    dash_segments = re.split(r"\s+[–—-]\s+", hint)
    if len(dash_segments) > 1:
        hint = dash_segments[-1].strip()
    labeled = re.match(rf"^(?:Popis|Prídavné meno|Podstatné meno|Substantívum):\s*(.+)$", hint, re.IGNORECASE)
    if labeled:
        return finalize_hint(labeled.group(1))
    contextual = re.match(rf"^(.*?)\s*\(({POS_LABEL}):\s*(.*)$", hint, re.IGNORECASE)
    if contextual:
        prefix = contextual.group(1).strip(" .,:;–—-")
        definition = contextual.group(3).strip(" .,:;–—-)")
        if prefix and not is_untrustworthy_headword(source, prefix) and not contains_english_fragment(prefix):
            return finalize_hint(prefix)
        if definition:
            return finalize_hint(definition)
    return finalize_hint(hint)


def select_hint(source: str, contextual_translation: str) -> tuple[str, bool]:
    output = contextual_translation.strip()
    segments = re.split(r"\s+[–—-]\s+", output)
    for segment in reversed(segments):
        headword = re.split(r"\s*\(", segment, maxsplit=1)[0].strip(" .,:;–—-")
        if headword and not contains_english_fragment(headword) and not is_untrustworthy_headword(source, headword):
            return headword, False

    # MADLAD translates the supplied sense definition inside parentheses. When the
    # headword is copied, misspelled, or omitted, that Slovak sense explanation is
    # a safer learning hint than an incorrect dictionary equivalent.
    parenthetical = re.search(r"\([^:()]+:\s*(.+)\)\s*$", output)
    if parenthetical:
        definition_hint = parenthetical.group(1).strip(" .,:;–—-")
        if definition_hint and not contains_english_fragment(definition_hint):
            return definition_hint, True
    raise RuntimeError(f"No safe Slovak hint in generated output for {source!r}: {output!r}")


def write_output(
    path: Path,
    entries: list[dict[str, object]],
    translations: dict[str, str],
    fallback_ids: set[str],
    overrides: dict[str, str],
) -> None:
    ordered = {}
    for entry in entries:
        entry_id = str(entry["id"])
        translation = clean_hint(
            str(entry["term"]),
            overrides.get(entry_id, translations.get(entry_id, "")),
        )
        if translation:
            ordered[entry_id] = translation
    identical = [
        str(entry["id"])
        for entry in entries
        if str(entry["id"]) in ordered
        and normalize_letters(ordered[str(entry["id"])]) == normalize_letters(str(entry["term"]))
    ]
    english_fragments = [entry_id for entry_id, hint in ordered.items() if contains_english_fragment(hint)]
    format_artifacts = [
        entry_id for entry_id, hint in ordered.items()
        if re.search(rf"(?:\(({POS_LABEL})(?::|\)?$)|^({POS_LABEL}):)", hint, re.IGNORECASE)
    ]
    payload = {
        "schemaVersion": 1,
        "sourceLanguage": "en",
        "targetLanguage": "sk",
        "catalogContentSha256": stable_catalog_hash(entries),
        "generator": {
            "model": MODEL_ID,
            "revision": MODEL_REVISION,
            "license": MODEL_LICENSE,
            "source": f"https://huggingface.co/{MODEL_ID}",
            "method": "Translate the English headword with its WordNet part of speech and sense definition; use the translated sense explanation when the headword result is unsafe.",
            "parameters": {"beamSize": 1, "definitionWords": 12, "maxDecodingLength": 48, "computeType": "int8"},
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        },
        "qa": {
            "catalogEntries": len(entries),
            "translatedEntries": len(ordered),
            "emptyTranslations": len(entries) - len(ordered),
            "identicalToEnglish": identical,
            "englishFragmentIds": english_fragments,
            "formatArtifactIds": format_artifacts,
            "definitionFallbackCount": len(fallback_ids),
            "definitionFallbackIds": sorted(fallback_ids),
            "overrideCount": len(overrides),
        },
        "translations": ordered,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main() -> None:
    args = parse_args()
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    entries = catalog["entries"]
    overrides = load_overrides(args.overrides)
    translations, fallback_ids = load_existing(args.output, args.force)
    missing = [entry for entry in entries if entry["id"] not in translations]
    if not missing:
        write_output(args.output, entries, translations, fallback_ids, overrides)
        print(f"All {len(entries):,} translations are already present in {args.output}.")
        return

    import ctranslate2
    from huggingface_hub import snapshot_download
    from transformers import T5Tokenizer

    model_path = args.model_path or Path(snapshot_download(MODEL_ID, revision=MODEL_REVISION))
    tokenizer = T5Tokenizer.from_pretrained(model_path)
    translator = ctranslate2.Translator(str(model_path), device="cpu", compute_type="int8")
    total_batches = (len(missing) + args.batch_size - 1) // args.batch_size
    try:
        for batch_index, offset in enumerate(range(0, len(missing), args.batch_size), start=1):
            batch = missing[offset:offset + args.batch_size]
            prompts = []
            for entry in batch:
                short_definition = " ".join(str(entry["definition"]).split()[:12])
                prompts.append(f"<2sk> {entry['term']} ({entry['partOfSpeech']}: {short_definition})")
            token_batches = [
                tokenizer.convert_ids_to_tokens(tokenizer.encode(prompt))
                for prompt in prompts
            ]
            results = translator.translate_batch(
                token_batches,
                beam_size=1,
                max_decoding_length=48,
                batch_type="tokens",
                max_batch_size=2048,
            )
            repairs = []
            for entry, result in zip(batch, results, strict=True):
                output = tokenizer.decode(
                    tokenizer.convert_tokens_to_ids(result.hypotheses[0]),
                    skip_special_tokens=True,
                )
                try:
                    hint, used_fallback = select_hint(str(entry["term"]), output)
                except RuntimeError:
                    repairs.append(entry)
                    continue
                entry_id = str(entry["id"])
                translations[entry_id] = hint
                if used_fallback:
                    fallback_ids.add(entry_id)
            if repairs:
                repair_prompts = [
                    f"<2sk> {' '.join(str(entry['definition']).split()[:12])}"
                    for entry in repairs
                ]
                repair_tokens = [
                    tokenizer.convert_ids_to_tokens(tokenizer.encode(prompt))
                    for prompt in repair_prompts
                ]
                repair_results = translator.translate_batch(
                    repair_tokens,
                    beam_size=1,
                    max_decoding_length=48,
                    batch_type="tokens",
                    max_batch_size=2048,
                )
                for entry, result in zip(repairs, repair_results, strict=True):
                    hint = tokenizer.decode(
                        tokenizer.convert_tokens_to_ids(result.hypotheses[0]),
                        skip_special_tokens=True,
                    ).strip(" .,:;–—-")
                    if not hint or contains_english_fragment(hint):
                        raise RuntimeError(f"Definition repair did not produce a safe Slovak hint for {entry['id']}: {hint!r}")
                    entry_id = str(entry["id"])
                    translations[entry_id] = hint
                    fallback_ids.add(entry_id)
            if batch_index % args.checkpoint_batches == 0 or batch_index == total_batches:
                write_output(args.output, entries, translations, fallback_ids, overrides)
                print(f"Translated {min(offset + len(batch), len(missing)):,}/{len(missing):,} missing entries.")
    except BaseException:
        write_output(args.output, entries, translations, fallback_ids, overrides)
        raise

    print(f"Created {args.output} with {len(translations):,} translations.")


if __name__ == "__main__":
    main()
