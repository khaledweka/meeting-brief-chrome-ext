# Public GitHub release checklist

Use this checklist before publishing the repository.

## Scope and licensing

- Confirm `LICENSE` exists at repository root.
- Confirm the project scope is clear: personal use, local-only, non-commercial.
- Ensure `README.md` and `docs/README.md` reflect the same usage limits.

## Security and privacy

- Do not commit `.env`, API keys, tokens, or private meeting artifacts.
- Confirm `.gitignore` excludes local environments and build output.
- Verify no real meeting recordings or transcripts are in git history.

## Build and runtime sanity checks

- Extension build passes from `extension/` with:
  - `npm install`
  - `npm run build`
- Python server starts from `server/` and `/health` returns success.

## Repository readiness

- Root README points to `docs/README.md` as the primary documentation hub.
- Optional: add screenshots and sample data that contain no private information.
- Tag the first public release after push (for example `v1.0.0`).
