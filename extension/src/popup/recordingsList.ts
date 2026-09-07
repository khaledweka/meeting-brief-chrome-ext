import { downloadBlobWithChrome } from "../lib/downloader.js";
import { MSG } from "../lib/messages.js";
import { getRecordingBlob } from "../lib/storage.js";
import {
  exportTranscript,
  formatSegmentsPlain,
  type ExportFormat,
} from "../lib/transcriptExport.js";
import type { RecordingMeta } from "../lib/types.js";
import { formatBytes, parseProvider, showError } from "./dom.js";

export type RecordingsUi = {
  recordingsList: HTMLUListElement;
  emptyRecordings: HTMLParagraphElement;
  transcriptCard: HTMLElement;
  transcriptBody: HTMLPreElement;
  actionError: HTMLParagraphElement;
  providerSelect: HTMLSelectElement;
  langSelect: HTMLSelectElement;
  progressEl: HTMLElement;
  loadRecordings: () => Promise<void>;
};

function setProgress(ui: RecordingsUi, text: string | null): void {
  if (!text) {
    ui.progressEl.hidden = true;
    ui.progressEl.textContent = "";
    return;
  }
  ui.progressEl.hidden = false;
  ui.progressEl.textContent = text;
}

export function renderTranscript(ui: RecordingsUi, meta: RecordingMeta): void {
  if (!meta.transcript?.segments?.length) {
    ui.transcriptBody.textContent = "No transcript stored for this recording.";
  } else {
    ui.transcriptBody.textContent = formatSegmentsPlain(meta.transcript.segments);
  }
  ui.transcriptCard.hidden = false;
  ui.transcriptCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function downloadExport(meta: RecordingMeta, format: ExportFormat): Promise<void> {
  const segments = meta.transcript?.segments;
  if (!segments?.length) {
    throw new Error("No transcript to export.");
  }
  const { content, mimeType, extension } = exportTranscript(segments, format);
  const stamp = new Date(meta.createdAt).toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([content], { type: mimeType });
  await downloadBlobWithChrome(blob, `meet-transcript-${stamp}.${extension}`);
}

export function renderRecordings(ui: RecordingsUi, list: RecordingMeta[]): void {
  ui.recordingsList.innerHTML = "";
  ui.emptyRecordings.hidden = list.length > 0;
  for (const item of list) {
    const li = document.createElement("li");
    li.className = "recording";
    const date = new Date(item.createdAt).toLocaleString();
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${date} · ${item.mode === "video" ? "Audio+Video" : "Audio only"} · ${formatBytes(item.sizeBytes)} · ${(item.durationMs / 1000).toFixed(0)}s`;
    const actions = document.createElement("div");
    actions.className = "row-actions";

    const btnTranscribe = document.createElement("button");
    btnTranscribe.className = "btn ghost sm";
    btnTranscribe.textContent = item.transcript ? "Re-transcribe" : "Transcribe";
    btnTranscribe.addEventListener("click", async () => {
      btnTranscribe.disabled = true;
      btnTranscribe.textContent = "Transcribing…";
      showError(ui.actionError, null);
      setProgress(ui, "Uploading recording and waiting for transcription…");
      try {
        const { provider, model } = parseProvider(ui.providerSelect.value);
        const storedKeys = await chrome.storage.local.get(`apiKey_${provider}`);
        const apiKey = (storedKeys[`apiKey_${provider}`] as string) || "";

        if ((provider === "gemini" || provider === "openai") && !apiKey) {
          throw new Error(`No API key saved for ${provider}. Enter your key above and click Save.`);
        }

        setProgress(ui, `Transcribing with ${provider}${model ? ` (${model})` : ""}…`);
        const r = (await chrome.runtime.sendMessage({
          type: MSG.TRANSCRIBE,
          payload: {
            id: item.id,
            language: ui.langSelect.value || undefined,
            provider: provider || undefined,
            model: model || undefined,
            apiKey: apiKey || undefined,
          },
        })) as { ok?: boolean; error?: string; transcript?: RecordingMeta["transcript"] };
        if (!r?.ok) throw new Error(r?.error || "Transcribe failed");
        setProgress(ui, "Transcription complete.");
        if (r.transcript) {
          renderTranscript(ui, { ...item, transcript: r.transcript });
        } else {
          renderTranscript(ui, item);
        }
        await ui.loadRecordings();
        globalThis.setTimeout(() => setProgress(ui, null), 2000);
      } catch (e) {
        setProgress(ui, null);
        showError(ui.actionError, String(e));
      } finally {
        btnTranscribe.disabled = false;
        btnTranscribe.textContent = item.transcript ? "Re-transcribe" : "Transcribe";
      }
    });

    const btnView = document.createElement("button");
    btnView.className = "btn ghost sm";
    btnView.textContent = "View transcript";
    btnView.disabled = !item.transcript;
    btnView.addEventListener("click", () => renderTranscript(ui, item));

    const exportSelect = document.createElement("select");
    exportSelect.className = "export-select";
    exportSelect.title = "Export transcript";
    exportSelect.disabled = !item.transcript;
    for (const [value, label] of [
      ["", "Export…"],
      ["txt", "TXT"],
      ["srt", "SRT"],
      ["vtt", "VTT"],
      ["json", "JSON"],
    ] as const) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      exportSelect.append(opt);
    }
    exportSelect.addEventListener("change", async () => {
      const format = exportSelect.value as ExportFormat | "";
      if (!format) return;
      try {
        await downloadExport(item, format);
      } catch (e) {
        showError(ui.actionError, String(e));
      } finally {
        exportSelect.value = "";
      }
    });

    let btnVideo: HTMLButtonElement | null = null;
    if (item.mode === "video") {
      btnVideo = document.createElement("button");
      btnVideo.className = "btn ghost sm";
      btnVideo.textContent = "Save video again";
      btnVideo.addEventListener("click", async () => {
        btnVideo!.disabled = true;
        try {
          const blob = await getRecordingBlob(item.id);
          if (!blob) throw new Error("Recording blob not found.");
          const stamp = new Date(item.createdAt).toISOString().replace(/[:.]/g, "-");
          await downloadBlobWithChrome(blob, `meet-recording-${stamp}.webm`);
        } catch (e) {
          showError(ui.actionError, String(e));
        } finally {
          btnVideo!.disabled = false;
        }
      });
    }

    const btnDel = document.createElement("button");
    btnDel.className = "btn ghost sm";
    btnDel.textContent = "Delete";
    btnDel.addEventListener("click", async () => {
      if (!confirm("Delete this recording from extension storage?")) return;
      const r = (await chrome.runtime.sendMessage({
        type: MSG.DELETE_RECORDING,
        payload: { id: item.id },
      })) as { ok?: boolean; error?: string };
      if (!r?.ok) {
        showError(ui.actionError, r?.error || "Delete failed");
        return;
      }
      await ui.loadRecordings();
    });

    actions.append(
      btnTranscribe,
      btnView,
      exportSelect,
      ...(btnVideo ? [btnVideo] : []),
      btnDel,
    );
    li.append(meta, actions);
    ui.recordingsList.append(li);
  }
}

export async function loadRecordings(ui: RecordingsUi): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ type: MSG.LIST_RECORDINGS })) as {
    ok?: boolean;
    list?: RecordingMeta[];
    error?: string;
  };
  if (!res?.ok) {
    showError(ui.actionError, res?.error || "Failed to list recordings");
    return;
  }
  renderRecordings(ui, res.list ?? []);
}
