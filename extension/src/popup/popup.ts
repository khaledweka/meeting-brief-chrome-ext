import { fetchHealth } from "../lib/api.js";
import { downloadBlobWithChrome } from "../lib/downloader.js";
import { MSG } from "../lib/messages.js";
import { getRecordingBlob } from "../lib/storage.js";
import type { RecordingMeta, TranscriptSegment } from "../lib/types.js";

const meetStatus = document.getElementById("meetStatus")!;
const callStatus = document.getElementById("callStatus")!;
const serverStatus = document.getElementById("serverStatus")!;
const recStatus = document.getElementById("recStatus")!;
const micSelect = document.getElementById("micSelect") as HTMLSelectElement;
const btnSetupMic = document.getElementById("btnSetupMic") as HTMLButtonElement;
const includeMic = document.getElementById("includeMic") as HTMLInputElement;
const langSelect = document.getElementById("langSelect") as HTMLSelectElement;
const providerSelect = document.getElementById("providerSelect") as HTMLSelectElement;
const apiKeyRow = document.getElementById("apiKeyRow") as HTMLDivElement;
const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const btnSaveKey = document.getElementById("btnSaveKey") as HTMLButtonElement;
const apiKeyHint = document.getElementById("apiKeyHint") as HTMLParagraphElement;
const includeVideo = document.getElementById("includeVideo") as HTMLInputElement;
const btnStart = document.getElementById("btnStart") as HTMLButtonElement;
const btnStop = document.getElementById("btnStop") as HTMLButtonElement;
const btnRefresh = document.getElementById("btnRefresh") as HTMLButtonElement;
const actionError = document.getElementById("actionError") as HTMLParagraphElement;
const recordingsList = document.getElementById("recordingsList") as HTMLUListElement;
const emptyRecordings = document.getElementById("emptyRecordings") as HTMLParagraphElement;
const transcriptCard = document.getElementById("transcriptCard") as HTMLElement;
const transcriptBody = document.getElementById("transcriptBody") as HTMLPreElement;
const btnCloseTranscript = document.getElementById("btnCloseTranscript") as HTMLButtonElement;

function setText(el: HTMLElement, text: string, cls?: string): void {
  el.textContent = text;
  el.className = cls ? `value ${cls}` : "value";
}

function showError(msg: string | null): void {
  if (!msg) {
    actionError.hidden = true;
    actionError.textContent = "";
    return;
  }
  actionError.hidden = false;
  actionError.textContent = msg;
}

async function getActiveMeetTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("meet.google.com")) {
    return null;
  }
  return tab.id;
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function fillMicDropdown(mics: MediaDeviceInfo[]): void {
  const prev = micSelect.value;
  while (micSelect.options.length > 1) micSelect.remove(1);

  for (const mic of mics) {
    const opt = document.createElement("option");
    opt.value = mic.deviceId;
    opt.textContent = mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`;
    micSelect.append(opt);
  }

  if (prev && Array.from(micSelect.options).some((o) => o.value === prev)) {
    micSelect.value = prev;
  } else if (mics.length > 0) {
    micSelect.value = mics[0].deviceId;
  }
}

function openSetupPage(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
}

async function populateMicrophones(): Promise<void> {
  // Try to load saved mic from storage first (set via setup page)
  const stored = await chrome.storage.local.get(["selectedMicDeviceId", "selectedMicLabel"]);
  if (stored.selectedMicDeviceId) {
    const opt = document.createElement("option");
    opt.value = stored.selectedMicDeviceId;
    opt.textContent = stored.selectedMicLabel || "Saved microphone";
    micSelect.append(opt);
    micSelect.value = stored.selectedMicDeviceId;
  }

  // Try enumerating devices (will have labels if permission was previously granted via setup page)
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");
    const hasLabels = mics.some((m) => m.label);

    if (hasLabels && mics.length > 0) {
      fillMicDropdown(mics);
      // Restore saved selection
      if (stored.selectedMicDeviceId) {
        const exists = Array.from(micSelect.options).some((o) => o.value === stored.selectedMicDeviceId);
        if (exists) micSelect.value = stored.selectedMicDeviceId;
      }
      return;
    }
  } catch {
    // enumerateDevices not available or failed
  }

  // If no labels (permission not granted) and no saved mic, show setup prompt
  if (!stored.selectedMicDeviceId) {
    btnSetupMic.classList.remove("hidden");
  }
}

async function refreshMeetState(): Promise<void> {
  const tabId = await getActiveMeetTabId();
  if (!tabId) {
    setText(meetStatus, "Open a Google Meet tab", "bad");
    setText(callStatus, "—", "muted");
    return;
  }
  setText(meetStatus, "Active Meet tab", "ok");
  const res = (await chrome.runtime.sendMessage({ type: MSG.GET_MEET_STATE })) as {
    ok?: boolean;
    meet?: { inMeeting: boolean; url: string } | null;
  };
  const inMeeting = Boolean(res?.meet?.inMeeting);
  setText(callStatus, inMeeting ? "Yes" : "No (join the call)", inMeeting ? "ok" : "warn");
}

async function refreshRecordingState(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ type: MSG.GET_RECORDING_STATE })) as {
    ok?: boolean;
    recordingActive?: boolean;
  };
  const active = Boolean(res?.recordingActive);
  btnStart.disabled = active;
  btnStop.disabled = !active;
  setText(recStatus, active ? "Recording…" : "Idle", active ? "warn" : "muted");
}

async function refreshServer(): Promise<void> {
  const h = await fetchHealth();
  if (!h.reachable) {
    setText(serverStatus, "Offline", "bad");
    return;
  }
  if (!h.ffmpeg) {
    setText(
      serverStatus,
      "Online — ffmpeg missing (transcribe will fail)",
      "warn",
    );
    return;
  }
  setText(serverStatus, "Online", "ok");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSegments(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${s.start.toFixed(1)}s–${s.end.toFixed(1)}s] ${s.speaker}: ${s.text.trim()}`)
    .join("\n");
}

function renderTranscript(meta: RecordingMeta): void {
  if (!meta.transcript?.segments?.length) {
    transcriptBody.textContent = "No transcript stored for this recording.";
  } else {
    transcriptBody.textContent = formatSegments(meta.transcript.segments);
  }
  transcriptCard.hidden = false;
  transcriptCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderRecordings(list: RecordingMeta[]): void {
  recordingsList.innerHTML = "";
  emptyRecordings.hidden = list.length > 0;
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
      showError(null);
      try {
        const { provider, model } = parseProvider(providerSelect.value);
        const storedKeys = await chrome.storage.local.get(`apiKey_${provider}`);
        const apiKey = (storedKeys[`apiKey_${provider}`] as string) || "";

        if ((provider === "gemini" || provider === "openai") && !apiKey) {
          throw new Error(`No API key saved for ${provider}. Enter your key above and click Save.`);
        }

        const r = (await chrome.runtime.sendMessage({
          type: MSG.TRANSCRIBE,
          payload: {
            id: item.id,
            language: langSelect.value || undefined,
            provider: provider || undefined,
            model: model || undefined,
            apiKey: apiKey || undefined,
          },
        })) as { ok?: boolean; error?: string; transcript?: RecordingMeta["transcript"] };
        console.log("[MeetingBrief] Transcribe response:", JSON.stringify(r).slice(0, 500));
        if (!r?.ok) throw new Error(r?.error || "Transcribe failed");
        if (r.transcript) {
          renderTranscript({ ...item, transcript: r.transcript });
        } else {
          renderTranscript(item);
        }
        await loadRecordings();
      } catch (e) {
        showError(String(e));
      } finally {
        btnTranscribe.disabled = false;
        btnTranscribe.textContent = item.transcript ? "Re-transcribe" : "Transcribe";
      }
    });

    const btnView = document.createElement("button");
    btnView.className = "btn ghost sm";
    btnView.textContent = "View transcript";
    btnView.disabled = !item.transcript;
    btnView.addEventListener("click", () => renderTranscript(item));

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
          showError(String(e));
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
        showError(r?.error || "Delete failed");
        return;
      }
      await loadRecordings();
    });

    actions.append(btnTranscribe, btnView, ...(btnVideo ? [btnVideo] : []), btnDel);
    li.append(meta, actions);
    recordingsList.append(li);
  }
}

async function loadRecordings(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ type: MSG.LIST_RECORDINGS })) as {
    ok?: boolean;
    list?: RecordingMeta[];
    error?: string;
  };
  if (!res?.ok) {
    showError(res?.error || "Failed to list recordings");
    return;
  }
  renderRecordings(res.list ?? []);
}

btnStart.addEventListener("click", async () => {
  showError(null);
  const tabId = await getActiveTabId();
  if (!tabId) {
    showError("Could not detect the active tab. Try closing and reopening the popup.");
    return;
  }

  const micDeviceId = includeMic.checked ? micSelect.value : "";
  if (includeMic.checked && !micDeviceId) {
    showError("No microphone selected. Click 'Setup microphone access' to grant permission and choose your mic.");
    openSetupPage();
    return;
  }

  const r = (await chrome.runtime.sendMessage({
    type: MSG.START_RECORDING,
    payload: { tabId, includeVideo: includeVideo.checked, micDeviceId },
  })) as { ok?: boolean; error?: string };
  if (!r?.ok) {
    showError(r?.error || "Could not start recording.");
    return;
  }
  await refreshRecordingState();
});

btnStop.addEventListener("click", async () => {
  showError(null);
  const r = (await chrome.runtime.sendMessage({ type: MSG.STOP_RECORDING })) as {
    ok?: boolean;
    error?: string;
  };
  if (!r?.ok) {
    showError(r?.error || "Could not stop recording.");
  }
  await refreshRecordingState();
  await loadRecordings();
});

btnRefresh.addEventListener("click", async () => {
  await Promise.all([refreshMeetState(), refreshRecordingState(), refreshServer(), loadRecordings()]);
});

btnCloseTranscript.addEventListener("click", () => {
  transcriptCard.hidden = true;
});

includeMic.addEventListener("change", () => {
  micSelect.disabled = !includeMic.checked;
});

btnSetupMic.addEventListener("click", openSetupPage);

function parseProvider(value: string): { provider: string; model?: string } {
  const [provider, model] = value.split(":");
  return { provider, model };
}

function getProviderBase(value: string): string {
  return value.split(":")[0];
}

const API_KEY_HINTS: Record<string, string> = {
  gemini: "Get free key at aistudio.google.com/apikey — each model has separate quota!",
  openai: "Get key at platform.openai.com/api-keys",
  lmstudio: "",
};

function updateProviderUI(): void {
  const base = getProviderBase(providerSelect.value);
  const isCloud = base === "gemini" || base === "openai";
  apiKeyRow.classList.toggle("hidden", !isCloud);
  apiKeyHint.textContent = API_KEY_HINTS[base] || "";
}

providerSelect.addEventListener("change", () => {
  updateProviderUI();
  void chrome.storage.local.set({ transcribeProvider: providerSelect.value });
});

btnSaveKey.addEventListener("click", async () => {
  const base = getProviderBase(providerSelect.value);
  const key = apiKeyInput.value.trim();
  if (!key) return;
  await chrome.storage.local.set({ [`apiKey_${base}`]: key });
  apiKeyInput.value = "";
  apiKeyInput.placeholder = "••• key saved •••";
  btnSaveKey.textContent = "Saved!";
  globalThis.setTimeout(() => { btnSaveKey.textContent = "Save"; }, 1500);
});

chrome.storage.onChanged.addListener((changes) => {
  void loadRecordings();
  if (changes.selectedMicDeviceId) {
    void populateMicrophones();
  }
});

void (async () => {
  // Restore saved settings
  const saved = await chrome.storage.local.get(["transcribeProvider"]);
  if (saved.transcribeProvider) {
    providerSelect.value = saved.transcribeProvider;
  }
  updateProviderUI();
  // Check if API key exists for current provider
  const providerBase = getProviderBase(providerSelect.value);
  if (providerBase === "gemini" || providerBase === "openai") {
    const keys = await chrome.storage.local.get(`apiKey_${providerBase}`);
    if (keys[`apiKey_${providerBase}`]) {
      apiKeyInput.placeholder = "••• key saved •••";
    }
  }

  await populateMicrophones();
  await Promise.all([refreshMeetState(), refreshRecordingState(), refreshServer(), loadRecordings()]);
})();
