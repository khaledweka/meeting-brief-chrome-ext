"""Align Whisper segments with diarization speaker intervals."""

from __future__ import annotations

from typing import Any


def _overlap(s0: float, s1: float, t0: float, t1: float) -> float:
    left = max(s0, t0)
    right = min(s1, t1)
    return max(0.0, right - left)


def humanize_speaker(label: str) -> str:
    """Map pyannote labels like SPEAKER_00 to Speaker 1."""
    raw = str(label).strip()
    if raw.upper().startswith("SPEAKER_"):
        suffix = raw.split("_", 1)[-1]
        try:
            n = int(suffix) + 1
            return f"Speaker {n}"
        except ValueError:
            pass
    return raw or "Speaker 1"


def merge_segments(
    whisper_segments: list[dict[str, Any]],
    diar_turns: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Assign a speaker label to each Whisper segment using max time overlap."""
    if not diar_turns:
        return [
            {
                "speaker": "Speaker 1",
                "start": float(seg["start"]),
                "end": float(seg["end"]),
                "text": str(seg.get("text", "")).strip(),
            }
            for seg in whisper_segments
        ]

    merged: list[dict[str, Any]] = []
    for seg in whisper_segments:
        s0 = float(seg["start"])
        s1 = float(seg["end"])
        text = str(seg.get("text", "")).strip()
        best_speaker = humanize_speaker(str(diar_turns[0].get("speaker", "SPEAKER_00")))
        best_ov = 0.0
        for turn in diar_turns:
            ov = _overlap(s0, s1, float(turn["start"]), float(turn["end"]))
            if ov > best_ov:
                best_ov = ov
                best_speaker = humanize_speaker(str(turn.get("speaker", "SPEAKER_00")))
        merged.append({"speaker": best_speaker, "start": s0, "end": s1, "text": text})
    return merged
