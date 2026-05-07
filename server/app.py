"""Local transcription server for Meeting Brief extension."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from debug_agent import agent_log
from diarize import run_diarization
from merge import merge_segments

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = Flask(__name__)

_fw_model = None
_fw_model_name: str | None = None


def _get_faster_whisper_model(model_name: str):  # type: ignore[no-untyped-def]
    global _fw_model, _fw_model_name
    from faster_whisper import WhisperModel  # type: ignore[import-untyped]

    if _fw_model is None or _fw_model_name != model_name:
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        log.info("Loading faster-whisper model=%s device=%s compute=%s", model_name, device, compute_type)
        _fw_model = WhisperModel(model_name, device=device, compute_type=compute_type)
        _fw_model_name = model_name
    return _fw_model


@app.after_request
def add_cors_headers(response):  # type: ignore[no-untyped-def]
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


_PATH_PREPENDED = False


def ensure_ffmpeg_on_path() -> str | None:
    """Whisper and other libs spawn `ffmpeg` by name; put our resolved binary on PATH (Windows WinError 2 fix)."""
    global _PATH_PREPENDED
    exe = _resolve_ffmpeg()
    if not exe:
        return None
    exe = _ensure_ffmpeg_command_name(Path(exe))
    if not _PATH_PREPENDED:
        parent = str(Path(exe).parent.resolve())
        os.environ["PATH"] = parent + os.pathsep + os.environ.get("PATH", "")
        _PATH_PREPENDED = True
        log.info("FFmpeg for subprocesses: %s (directory prepended to PATH)", exe)
    return exe


def _ensure_ffmpeg_command_name(exe: Path) -> str:
    """Whisper calls `ffmpeg`; imageio-ffmpeg ships a differently named exe on Windows."""
    if exe.name.lower() in {"ffmpeg", "ffmpeg.exe"}:
        return str(exe.resolve())

    shim_dir = Path(__file__).resolve().parent / ".ffmpeg-bin"
    shim_dir.mkdir(exist_ok=True)
    shim = shim_dir / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if not shim.exists() or shim.stat().st_size != exe.stat().st_size:
        shutil.copy2(exe, shim)
    return str(shim.resolve())


def _resolve_ffmpeg() -> str | None:
    """PATH, FFMPEG_PATH / FFMPEG_BIN, or imageio-ffmpeg's bundled binary (Windows-friendly)."""
    for key in ("FFMPEG_PATH", "FFMPEG_BIN"):
        raw = (os.environ.get(key) or "").strip()
        if raw:
            p = Path(raw)
            if p.is_file():
                return str(p.resolve())
    w = shutil.which("ffmpeg")
    if w:
        return w
    try:
        import imageio_ffmpeg  # type: ignore[import-untyped]

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and Path(exe).is_file():
            return str(Path(exe).resolve())
    except Exception:
        log.debug("imageio_ffmpeg fallback unavailable", exc_info=True)
    return None


@app.route("/health", methods=["GET", "OPTIONS"])
def health():  # type: ignore[no-untyped-def]
    if request.method == "OPTIONS":
        return ("", 204)
    ff = ensure_ffmpeg_on_path()
    return jsonify({"ok": True, "ffmpeg": ff is not None})


def _ffmpeg_to_wav_16k_mono(src: Path, dst_wav: Path) -> None:
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        raise RuntimeError(
            "ffmpeg not found. Options: (1) Install ffmpeg and add to PATH, "
            "(2) set FFMPEG_PATH to ffmpeg.exe, (3) pip install imageio-ffmpeg (already in requirements.txt)."
        )
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(src),
        "-ar",
        "16000",
        "-ac",
        "1",
        str(dst_wav),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def _ffmpeg_extract_audio(src: Path, dst: Path, fmt: str = "mp3") -> None:
    """Extract audio-only in a compact format for cloud API upload."""
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found")
    cmd = [ffmpeg, "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000"]
    if fmt == "mp3":
        cmd += ["-codec:a", "libmp3lame", "-b:a", "64k"]
    cmd.append(str(dst))
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


@app.route("/transcribe", methods=["POST", "OPTIONS"])
def transcribe():  # type: ignore[no-untyped-def]
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        ensure_ffmpeg_on_path()

        if "file" not in request.files:
            return jsonify({"error": "Missing multipart field `file`."}), 400

        upload = request.files["file"]
        if not upload.filename:
            return jsonify({"error": "Empty filename."}), 400

        language_hint = request.form.get("language", "").strip() or None
        provider = request.form.get("provider", "").strip() or "whisper-local"
        cloud_model = request.form.get("model", "").strip() or None
        api_key = request.form.get("api_key", "").strip() or ""

        # region agent log
        agent_log(
            "pre-fix",
            "H1 H2 H3 H4",
            "server/app.py:transcribe-request",
            "Transcribe request received",
            {
                "provider": provider,
                "model": cloud_model,
                "language": language_hint or "auto",
                "hasApiKey": bool(api_key),
                "filenameExt": Path(upload.filename).suffix.lower(),
                "contentType": upload.content_type,
            },
        )
        # endregion

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "input.webm"
            upload.save(src)

            # --- LM Studio: whisper + local LLM correction ---
            if provider == "lmstudio":
                wav = tmp_path / "audio.wav"
                try:
                    _ffmpeg_to_wav_16k_mono(src, wav)
                except subprocess.CalledProcessError as exc:
                    stderr = (
                        exc.stderr.decode(errors="ignore")
                        if isinstance(exc.stderr, (bytes, bytearray))
                        else str(exc.stderr)
                    )
                    return jsonify({"error": f"ffmpeg failed: {stderr}"}), 400

                # Step 1: use large-v3 for best Arabic accuracy
                local_model = os.environ.get("WHISPER_MODEL", "large-v3")
                try:
                    fw = _get_faster_whisper_model(local_model)
                except Exception as exc:
                    return jsonify({"error": f"faster-whisper load failed: {exc}"}), 500

                log.info("LM Studio pipeline: step 1 — faster-whisper (%s)", local_model)
                fw_opts: dict[str, Any] = {"beam_size": 5, "vad_filter": True}
                if language_hint:
                    fw_opts["language"] = language_hint

                segments_iter, info = fw.transcribe(str(wav), **fw_opts)
                raw_segments: list[dict[str, Any]] = []
                for seg in segments_iter:
                    raw_segments.append({
                        "start": seg.start,
                        "end": seg.end,
                        "speaker": "Speaker 1",
                        "text": seg.text,
                    })
                log.info("Step 1 done: %d segments from whisper", len(raw_segments))

                # Step 2: LLM correction via LM Studio
                from llm_correct import correct_transcript

                lm_url = os.environ.get("LM_STUDIO_URL", "http://127.0.0.1:1234/v1/chat/completions")
                log.info("LM Studio pipeline: step 2 — LLM correction (%s, model=%s)", lm_url, cloud_model or "default")
                corrected = correct_transcript(raw_segments, language_hint, lm_url, cloud_model)

                return jsonify({
                    "segments": corrected,
                    "language": info.language,
                    "model": f"faster-whisper-{local_model} + lmstudio",
                })

            # --- Cloud providers ---
            if provider in ("gemini", "openai") and api_key:
                from cloud_transcribe import transcribe_gemini, transcribe_openai

                audio_file = tmp_path / "audio.mp3"
                try:
                    _ffmpeg_extract_audio(src, audio_file, fmt="mp3")
                except subprocess.CalledProcessError as exc:
                    stderr = (
                        exc.stderr.decode(errors="ignore")
                        if isinstance(exc.stderr, (bytes, bytearray))
                        else str(exc.stderr)
                    )
                    return jsonify({"error": f"ffmpeg failed: {stderr}"}), 400

                audio_size = audio_file.stat().st_size
                log.info(
                    "Cloud transcription: provider=%s, audio=%d KB, language=%s",
                    provider,
                    audio_size // 1024,
                    language_hint or "auto",
                )
                # region agent log
                agent_log(
                    "pre-fix",
                    "H1 H3 H4",
                    "server/app.py:cloud-audio-ready",
                    "Cloud audio extracted",
                    {
                        "provider": provider,
                        "model": cloud_model,
                        "sourceBytes": src.stat().st_size,
                        "audioBytes": audio_size,
                    },
                )
                # endregion

                if provider == "gemini":
                    result = transcribe_gemini(audio_file, api_key, language_hint, cloud_model)
                else:
                    result = transcribe_openai(audio_file, api_key, language_hint)

                return jsonify(result)

            # --- Local faster-whisper ---
            model_name = os.environ.get("WHISPER_MODEL", "base")
            wav = tmp_path / "audio.wav"

            try:
                _ffmpeg_to_wav_16k_mono(src, wav)
            except subprocess.CalledProcessError as exc:
                stderr = (
                    exc.stderr.decode(errors="ignore")
                    if isinstance(exc.stderr, (bytes, bytearray))
                    else str(exc.stderr)
                )
                return jsonify({"error": f"ffmpeg failed: {stderr}"}), 400
            except Exception as exc:
                return jsonify({"error": str(exc)}), 400

            try:
                model = _get_faster_whisper_model(model_name)
            except Exception as exc:
                return jsonify({"error": f"faster-whisper load failed: {exc}"}), 500

            wav_size = wav.stat().st_size
            log.info("WAV file size: %d bytes (%.1f KB)", wav_size, wav_size / 1024)
            if wav_size < 5000:
                log.warning("WAV file is very small — recording may have no audio")

            fw_opts: dict[str, Any] = {"beam_size": 5, "vad_filter": True}
            if language_hint:
                fw_opts["language"] = language_hint

            log.info(
                "Running faster-whisper (model=%s, language=%s)",
                model_name,
                language_hint or "auto-detect",
            )
            import time as _time
            t0 = _time.monotonic()

            segments_iter, info = model.transcribe(str(wav), **fw_opts)
            whisper_segments: list[dict[str, Any]] = []
            for seg in segments_iter:
                whisper_segments.append({
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text,
                })

            elapsed = _time.monotonic() - t0
            log.info(
                "faster-whisper: %d segment(s), language=%s, took %.1fs",
                len(whisper_segments),
                info.language,
                elapsed,
            )

            log.info("Running diarization")
            diar_turns = run_diarization(wav)

            merged = merge_segments(whisper_segments, diar_turns)

            return jsonify(
                {
                    "segments": merged,
                    "language": info.language,
                    "model": f"faster-whisper-{model_name}",
                }
            )
    except Exception as exc:
        log.exception("transcribe failed")
        return jsonify({"error": str(exc)}), 500


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    # Default 5055: Windows often reserves/blocks 5000 (AirPlay / excluded port range).
    port = int(os.environ.get("PORT", "5055"))
    ff = ensure_ffmpeg_on_path()
    log.info("ffmpeg: %s", ff or "NOT FOUND (transcribe will fail until resolved)")
    log.info("Meeting Brief API listening on http://%s:%s", host, port)
    try:
        # threaded=True helps if Whisper/pyannote block the GIL momentarily on some builds
        app.run(host=host, port=port, debug=False, threaded=True)
    except OSError as exc:
        log.error(
            "Could not bind to %s:%s (%s). Try another port, e.g. PORT=8765",
            host,
            port,
            exc,
        )
        raise


if __name__ == "__main__":
    main()
