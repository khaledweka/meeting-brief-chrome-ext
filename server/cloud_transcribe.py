"""Cloud-based transcription via Gemini Flash or OpenAI Whisper API."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from debug_agent import agent_log

log = logging.getLogger(__name__)


def _friendly_gemini_error(exc: Exception, model_id: str) -> str:
    msg = str(exc)
    if "429" in msg and "quota" in msg.lower():
        return (
            f"Gemini quota exceeded for {model_id}. "
            "Choose another Gemini model, wait for quota reset, or use another API key/project."
        )
    return msg


def transcribe_gemini(
    audio_path: Path,
    api_key: str,
    language: str | None = None,
    model_name: str | None = None,
) -> dict[str, Any]:
    """Transcribe using Google Gemini (free tier supports long audio)."""
    import google.generativeai as genai  # type: ignore[import-untyped]

    genai.configure(api_key=api_key)

    model_id = model_name or "gemini-2.0-flash"

    lang_instruction = ""
    if language:
        lang_map = {"ar": "Arabic", "en": "English"}
        lang_instruction = f" The primary language is {lang_map.get(language, language)}."

    prompt = (
        "Transcribe this audio recording accurately and completely. "
        "Return ONLY a JSON array of segments, each with keys: "
        '"start" (seconds float), "end" (seconds float), "speaker" (e.g. "Speaker 1"), "text" (transcribed text). '
        "Preserve the original language exactly — do not translate. "
        "If speakers switch between languages (e.g. Arabic and English), keep each part in its original language."
        f"{lang_instruction}"
    )

    log.info("Uploading audio to Gemini (%s)", audio_path.name)
    uploaded = genai.upload_file(str(audio_path))

    model = genai.GenerativeModel(model_id)
    log.info("Sending to %s for transcription", model_id)
    # region agent log
    agent_log(
        "pre-fix",
        "H1 H3 H4",
        "server/cloud_transcribe.py:gemini-before-request",
        "Sending audio to Gemini",
        {
            "model": model_id,
            "language": language or "auto",
            "audioBytes": audio_path.stat().st_size,
        },
    )
    # endregion
    try:
        response = model.generate_content(
            [prompt, uploaded],
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
    except Exception as exc:
        # region agent log
        agent_log(
            "post-fix",
            "H4",
            "server/cloud_transcribe.py:gemini-request-error",
            "Gemini request failed before returning transcript JSON",
            {
                "model": model_id,
                "errorType": type(exc).__name__,
                "isQuotaError": "429" in str(exc) and "quota" in str(exc).lower(),
            },
        )
        # endregion
        raise RuntimeError(_friendly_gemini_error(exc, model_id)) from exc

    try:
        uploaded.delete()
    except Exception:
        pass

    raw = response.text.strip()
    # region agent log
    agent_log(
        "pre-fix",
        "H1 H2 H3",
        "server/cloud_transcribe.py:gemini-response",
        "Gemini response metadata before JSON parsing",
        {
            "rawLength": len(raw),
            "startsWithFence": raw.startswith("```"),
            "firstChar": raw[:1],
            "lastChar": raw[-1:] if raw else "",
            "openSquareCount": raw.count("["),
            "closeSquareCount": raw.count("]"),
            "openBraceCount": raw.count("{"),
            "closeBraceCount": raw.count("}"),
            "quoteCount": raw.count('"'),
            "finishReason": str(getattr(getattr(response, "candidates", [None])[0], "finish_reason", "")) if getattr(response, "candidates", None) else "",
        },
    )
    # endregion
    # Gemini may wrap in ```json ... ```
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        segments = json.loads(raw)
    except json.JSONDecodeError as exc:
        # region agent log
        agent_log(
            "pre-fix",
            "H1 H2 H3",
            "server/cloud_transcribe.py:gemini-json-error",
            "Gemini JSON parsing failed",
            {
                "error": exc.msg,
                "line": exc.lineno,
                "column": exc.colno,
                "position": exc.pos,
                "rawLength": len(raw),
                "lastChar": raw[-1:] if raw else "",
                "openSquareCount": raw.count("["),
                "closeSquareCount": raw.count("]"),
                "openBraceCount": raw.count("{"),
                "closeBraceCount": raw.count("}"),
                "quoteCount": raw.count('"'),
            },
        )
        # endregion
        raise
    if not isinstance(segments, list):
        segments = segments.get("segments", [])

    # region agent log
    agent_log(
        "pre-fix",
        "H1 H2 H3",
        "server/cloud_transcribe.py:gemini-json-ok",
        "Gemini JSON parsed successfully",
        {
            "model": model_id,
            "segmentCount": len(segments),
            "rawLength": len(raw),
        },
    )
    # endregion
    log.info("Gemini (%s) returned %d segment(s)", model_id, len(segments))
    return {
        "segments": segments,
        "language": language or "auto",
        "model": model_id,
    }


def transcribe_openai(
    audio_path: Path,
    api_key: str,
    language: str | None = None,
) -> dict[str, Any]:
    """Transcribe using OpenAI Whisper API (25 MB limit, chunks if needed)."""
    from openai import OpenAI  # type: ignore[import-untyped]

    client = OpenAI(api_key=api_key)

    file_size = audio_path.stat().st_size
    log.info("Sending to OpenAI Whisper API (%d KB)", file_size // 1024)

    kwargs: dict[str, Any] = {
        "model": "whisper-1",
        "file": open(audio_path, "rb"),  # noqa: SIM115
        "response_format": "verbose_json",
        "timestamp_granularities": ["segment"],
    }
    if language:
        kwargs["language"] = language

    response = client.audio.transcriptions.create(**kwargs)

    segments = []
    for seg in getattr(response, "segments", []) or []:
        segments.append({
            "start": seg.get("start", seg.get("startTime", 0)),
            "end": seg.get("end", seg.get("endTime", 0)),
            "speaker": "Speaker 1",
            "text": seg.get("text", ""),
        })

    log.info("OpenAI returned %d segment(s)", len(segments))
    return {
        "segments": segments,
        "language": getattr(response, "language", language or "auto"),
        "model": "openai-whisper-1",
    }
