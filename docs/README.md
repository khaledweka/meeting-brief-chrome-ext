# Meeting Brief — documentation

Chrome / Edge extension plus a small local Python server for offline-capable transcription and speaker diarization.

**If Chrome says the manifest is missing:** you pointed **Load unpacked** at the wrong directory. Select **`extension/dist`** (after running `npm run build` in the `extension` folder), not the git repo root.

## Components

| Path | Purpose |
|------|---------|
| [`extension/`](../extension/) | Manifest V3 extension (Vite + TypeScript) |
| [`extension/dist/`](../extension/dist/) | Built output — load this folder as **unpacked** in Chrome/Edge |
| [`server/`](../server/) | Flask API (`/health`, `/transcribe`) using Whisper + pyannote |

## Prerequisites

- **Node.js 18+** (build the extension)
- **Python 3.10+** (Whisper + conversion)
- **ffmpeg** for audio conversion (see below — `pip install -r requirements.txt` includes **imageio-ffmpeg**, which downloads a binary if `ffmpeg` is not on your `PATH`)
- **Hugging Face account** + token for pyannote models (free; one-time license acceptance)
- **Microphone permission** in Chrome/Edge — the extension mixes your microphone with the Meet tab audio so your own voice is recorded too.

## Build the extension

```bash
cd extension
npm install
npm run build
```

Then in Chrome or Edge:

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. **Load unpacked** → select the **`extension/dist`** directory (full path ends with `…\meeting-brief-chrome-ext\extension\dist`). The folder you pick must contain `manifest.json` at its top level.

## Run the transcription server

```bash
cd server
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

### ffmpeg (required for transcribe)

The server converts WebM to WAV using **ffmpeg**. The extension popup shows **Online — ffmpeg missing** if none is found.

1. **Recommended (already in `requirements.txt`):** after `pip install -r requirements.txt`, the package **imageio-ffmpeg** supplies a bundled `ffmpeg` used automatically when `ffmpeg` is not on `PATH`.
2. **Or** install [ffmpeg](https://ffmpeg.org/download.html) and ensure `ffmpeg -version` works in the same terminal you use to run `python app.py`.
3. **Or** set `FFMPEG_PATH` (full path to `ffmpeg.exe` on Windows), e.g. `C:\ffmpeg\bin\ffmpeg.exe`.

### Recording has video but no sound in the file

- In Chrome, **right‑click the Meet tab** and make sure **“Mute site”** is off (tab capture records tab audio; a muted tab is silent).
- Allow the extension’s microphone permission prompt; your own voice is recorded from your microphone because Google Meet usually does **not** play your own mic back into the tab.
- In Meet, confirm other speakers are audible in the call.

### Hugging Face token (diarization)

1. Create a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Accept the model conditions for `pyannote/speaker-diarization-3.1` on the model card
3. Export the token before starting the server:

```bash
# Windows PowerShell
$env:HF_TOKEN="hf_..."

# macOS/Linux
export HF_TOKEN="hf_..."
```

Optional:

- `WHISPER_MODEL` — default `base` (`tiny`, `small`, `medium`, `large` also supported)
- `HOST` / `PORT` — default `127.0.0.1:5055` (port **5000** is often blocked on Windows; override with `PORT` if needed)

Start the API:

```bash
python app.py
```

## Usage flow

1. Join a Google Meet call in a normal tab.
2. Open the extension popup from that tab (or switch back to Meet before **Start**).
3. Toggle **Include video** if you want a WebM download when you stop (large files).
4. **Start recording** → **Stop recording** when finished.
5. For video mode, Chrome prompts to save the `.webm` file (you can use **Save video again** in the recordings list to re-download from stored data).
6. Click **Transcribe** on a saved recording (server must be running).

## Permissions (why they exist)

- **tabCapture** — capture Meet tab audio/video
- **offscreen** — run `MediaRecorder` off the service worker (Manifest V3)
- **downloads** — “Save As” download for video recordings
- **audioCapture** — capture your microphone and mix it with the Meet tab audio
- **storage** + **IndexedDB** — recording blobs + metadata
- **host_permissions** — `meet.google.com` content script; `localhost` / `127.0.0.1` for the local API
- **tabs** — open a short-lived `download.html` tab to save video files (`chrome.downloads` is not available in the service worker or offscreen document)

## Troubleshooting

- **“Could not start recording”** — ensure the **active tab** is the Meet tab when you press Start, and that you are in a call (green “In call” helps).
- **Transcription server offline** — confirm `python app.py` is running and `http://127.0.0.1:5055/health` returns JSON in a browser.
- **Diarization skipped / everyone is “Speaker 1”** — check `HF_TOKEN`, model license acceptance, and server logs.
- **ffmpeg errors** — run `pip install -r requirements.txt` (includes `imageio-ffmpeg`), or install ffmpeg on `PATH`, or set `FFMPEG_PATH`. Restart `python app.py` and check the server log line `ffmpeg: ...`.

## Legal / ethics

Only record meetings where **all participants have consented** and your organization’s policies allow it. This tool is intended for personal / internal productivity use.

## License

This project uses the `Meeting Brief Personal Local Use License v1.0`.

- Free to use for personal use.
- Local-only execution (no hosted, cloud, API, or SaaS usage).
- Non-commercial usage only.

See the repository root `LICENSE` file for complete terms.
