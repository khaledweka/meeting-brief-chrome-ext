# Agent coding standards (Meeting Brief)

Use this document as the default quality bar for AI-assisted changes in this repository.

## General

- Prefer **small, reviewable** changes with clear commit messages.
- Match existing **formatting** and **patterns** in the touched area.
- Do not add secrets, tokens, or private meeting content to the repo.

## TypeScript / extension

- Keep the extension **Manifest V3** compliant (service worker constraints, offscreen document for `MediaRecorder`).
- Prefer **explicit types** at module boundaries (`lib/types.ts`, message payloads).
- Avoid DOM APIs in the **service worker** (use offscreen/popup instead).
- Prefer **relative asset URLs** (`base: "./"` in Vite) so Chrome can load popup/offscreen scripts.

## Python / server

- Keep endpoints **small** and **logging-friendly**; never log raw audio bytes.
- Treat uploaded media as **untrusted input**; operate on temp files inside a `TemporaryDirectory`.
- Fail gracefully: if diarization is unavailable, still return Whisper text with a neutral speaker label.

## Documentation

- User-facing setup belongs in **[docs/README.md](../README.md)** (single documentation hub under `docs/`).
