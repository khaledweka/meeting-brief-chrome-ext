"""Speaker diarization using pyannote.audio (requires HF_TOKEN)."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

_pipeline = None


def _load_pipeline(token: str):  # type: ignore[no-untyped-def]
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    from pyannote.audio import Pipeline  # type: ignore[import-untyped]
    import torch

    try:
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=token,
        )
    except TypeError:
        # Older huggingface_hub / pyannote builds
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=token,
        )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    _pipeline.to(device)
    return _pipeline


def run_diarization(wav_path: str | Path) -> list[dict[str, Any]]:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if not token:
        log.warning("HF_TOKEN not set; skipping diarization.")
        return []

    try:
        pipeline = _load_pipeline(token)
    except Exception as exc:
        log.exception("Failed to load diarization pipeline: %s", exc)
        return []

    wav_path = Path(wav_path)
    try:
        diarization = pipeline(str(wav_path))
    except Exception as exc:
        log.exception("Diarization failed: %s", exc)
        return []

    turns: list[dict[str, Any]] = []
    try:
        for segment, _track, label in diarization.itertracks(yield_label=True):
            turns.append(
                {
                    "start": float(segment.start),
                    "end": float(segment.end),
                    "speaker": str(label),
                }
            )
    except Exception as exc:
        log.exception("Failed to iterate diarization output: %s", exc)
        return []

    turns.sort(key=lambda x: x["start"])
    return turns
