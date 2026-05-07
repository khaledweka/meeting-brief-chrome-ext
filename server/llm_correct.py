"""Post-process Whisper transcript using a local LLM (LM Studio / Ollama / any OpenAI-compatible API)."""

from __future__ import annotations

import json
import logging
from typing import Any

import requests

log = logging.getLogger(__name__)

DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234/v1/chat/completions"


def correct_transcript(
    raw_segments: list[dict[str, Any]],
    language: str | None = None,
    api_url: str = DEFAULT_LM_STUDIO_URL,
    model: str | None = None,
) -> list[dict[str, Any]]:
    """Send raw Whisper segments to a local LLM for correction."""
    if not raw_segments:
        return raw_segments

    raw_text_lines = []
    for seg in raw_segments:
        start = seg.get("start", 0)
        end = seg.get("end", 0)
        speaker = seg.get("speaker", "Speaker 1")
        text = seg.get("text", "").strip()
        raw_text_lines.append(f"[{start:.1f}s-{end:.1f}s] {speaker}: {text}")

    raw_transcript = "\n".join(raw_text_lines)

    lang_hint = ""
    if language:
        lang_map = {"ar": "Arabic", "en": "English"}
        lang_hint = f" The primary language is {lang_map.get(language, language)}."

    system_prompt = (
        "You are an expert Arabic and English transcript correction assistant. "
        "You receive raw output from a speech-to-text system that often makes severe errors, "
        "especially with Arabic words. Your job:\n"
        "1. Fix garbled/nonsensical Arabic words into the most likely correct Arabic words.\n"
        "2. Fix transliteration errors (e.g. 'متخب' → 'منتخب', 'لاعيب' → 'لاعب').\n"
        "3. Reconstruct broken phrases into coherent Arabic sentences.\n"
        "4. Keep English words as-is if they appear.\n"
        "5. Add proper Arabic punctuation.\n"
        "6. Keep the EXACT same timestamp format and speaker labels.\n"
        "7. Do NOT translate — output Arabic for Arabic speech, English for English speech.\n"
        "8. Do NOT add or remove segment lines.\n"
        "9. If a segment is too garbled to understand, make your best guess from context."
        f"{lang_hint}"
    )

    user_prompt = (
        "Correct this raw speech-to-text transcript. The ASR system made many errors, "
        "especially with Arabic words. Reconstruct the correct Arabic text from the garbled output. "
        "Return ONLY the corrected transcript in the same format "
        "(one line per segment: [start-end] Speaker: text):\n\n"
        f"{raw_transcript}"
    )

    payload: dict[str, Any] = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
        "stream": False,
    }
    if model:
        payload["model"] = model

    log.info("Sending %d segments to LLM for correction (%s)", len(raw_segments), api_url)

    try:
        resp = requests.post(api_url, json=payload, timeout=120)
        resp.raise_for_status()
    except requests.ConnectionError:
        log.warning("LM Studio not reachable at %s — returning raw transcript", api_url)
        return raw_segments
    except Exception as exc:
        log.warning("LLM correction failed: %s — returning raw transcript", exc)
        return raw_segments

    data = resp.json()
    corrected_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")

    if not corrected_text.strip():
        log.warning("LLM returned empty response — returning raw transcript")
        return raw_segments

    # Parse corrected lines back into segments
    corrected_segments = _parse_corrected_lines(corrected_text, raw_segments)
    log.info("LLM correction done: %d segments", len(corrected_segments))
    return corrected_segments


def _parse_corrected_lines(
    corrected_text: str,
    original_segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Parse LLM-corrected text back into segment dicts, falling back to originals."""
    import re

    lines = [l.strip() for l in corrected_text.strip().split("\n") if l.strip()]

    # Pattern: [0.0s-2.5s] Speaker 1: text here
    seg_pattern = re.compile(r"^\[[\d.]+s[-–][\d.]+s\]\s*[^:]+:\s*(.+)$")

    result = []
    for i, orig in enumerate(original_segments):
        if i < len(lines):
            line = lines[i]
            m = seg_pattern.match(line)
            corrected = m.group(1).strip() if m else line
            result.append({
                "start": orig["start"],
                "end": orig["end"],
                "speaker": orig.get("speaker", "Speaker 1"),
                "text": corrected if corrected else orig.get("text", ""),
            })
        else:
            result.append(orig)

    return result
