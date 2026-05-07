# Meeting Brief (Chrome / Edge)

Record Google Meet tab audio (optionally video), save locally, and transcribe with speaker labels using a **local** Whisper + pyannote server.

## License and usage scope

This repository is published publicly for transparency and community learning, but it is licensed for:

- free personal use only
- local execution only (no hosted/cloud/API/SaaS deployment)
- non-commercial use only

See `LICENSE` for full terms.

## Chrome / Edge: “Manifest file is missing”

That error means the wrong folder was selected. **Do not** load the repository root (`meeting-brief-chrome-ext`).

1. Build the extension: `cd extension` → `npm install` → `npm run build`
2. **Load unpacked** and choose the **`extension\dist`** folder (on disk it must contain `manifest.json` next to `background.js`).

More detail: **[extension/README.md](extension/README.md)**

Documentation: **[docs/README.md](docs/README.md)**
