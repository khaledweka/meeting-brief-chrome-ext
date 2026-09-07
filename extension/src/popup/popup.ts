import { MSG } from "../lib/messages.js";
import { getActiveTabId, showError } from "./dom.js";
import { openSetupPage, populateMicrophones } from "./micSetup.js";
import { bindProviderControls, restoreProviderSettings } from "./providerSettings.js";
import { loadRecordings, type RecordingsUi } from "./recordingsList.js";
import { refreshMeetState, refreshRecordingState, refreshServer } from "./status.js";

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
const autoRecord = document.getElementById("autoRecord") as HTMLInputElement;
const btnStart = document.getElementById("btnStart") as HTMLButtonElement;
const btnStop = document.getElementById("btnStop") as HTMLButtonElement;
const btnRefresh = document.getElementById("btnRefresh") as HTMLButtonElement;
const btnOptions = document.getElementById("btnOptions") as HTMLButtonElement | null;
const actionError = document.getElementById("actionError") as HTMLParagraphElement;
const progressEl = document.getElementById("transcribeProgress") as HTMLElement;
const recordingsList = document.getElementById("recordingsList") as HTMLUListElement;
const emptyRecordings = document.getElementById("emptyRecordings") as HTMLParagraphElement;
const transcriptCard = document.getElementById("transcriptCard") as HTMLElement;
const transcriptBody = document.getElementById("transcriptBody") as HTMLPreElement;
const btnCloseTranscript = document.getElementById("btnCloseTranscript") as HTMLButtonElement;

const ui: RecordingsUi = {
  recordingsList,
  emptyRecordings,
  transcriptCard,
  transcriptBody,
  actionError,
  providerSelect,
  langSelect,
  progressEl,
  loadRecordings: () => loadRecordings(ui),
};

btnStart.addEventListener("click", async () => {
  showError(actionError, null);
  const tabId = await getActiveTabId();
  if (!tabId) {
    showError(actionError, "Could not detect the active tab. Try closing and reopening the popup.");
    return;
  }

  const micDeviceId = includeMic.checked ? micSelect.value : "";
  if (includeMic.checked && !micDeviceId) {
    showError(
      actionError,
      "No microphone selected. Click 'Setup microphone access' to grant permission and choose your mic.",
    );
    openSetupPage();
    return;
  }

  await chrome.storage.local.set({
    includeVideo: includeVideo.checked,
    micDeviceId: micDeviceId || "",
  });

  const r = (await chrome.runtime.sendMessage({
    type: MSG.START_RECORDING,
    payload: { tabId, includeVideo: includeVideo.checked, micDeviceId },
  })) as { ok?: boolean; error?: string };
  await refreshRecordingState(recStatus, btnStart, btnStop);
  if (!r?.ok) {
    showError(actionError, r?.error || "Could not start recording.");
  }
});

btnStop.addEventListener("click", async () => {
  showError(actionError, null);
  const r = (await chrome.runtime.sendMessage({ type: MSG.STOP_RECORDING })) as {
    ok?: boolean;
    error?: string;
  };
  if (!r?.ok) {
    showError(actionError, r?.error || "Could not stop recording.");
  }
  await refreshRecordingState(recStatus, btnStart, btnStop);
  await loadRecordings(ui);
});

btnRefresh.addEventListener("click", async () => {
  await Promise.all([
    refreshMeetState(meetStatus, callStatus),
    refreshRecordingState(recStatus, btnStart, btnStop),
    refreshServer(serverStatus),
    loadRecordings(ui),
  ]);
});

btnCloseTranscript.addEventListener("click", () => {
  transcriptCard.hidden = true;
});

includeMic.addEventListener("change", () => {
  micSelect.disabled = !includeMic.checked;
});

includeVideo.addEventListener("change", () => {
  void chrome.storage.local.set({ includeVideo: includeVideo.checked });
});

autoRecord.addEventListener("change", () => {
  void chrome.storage.local.set({ autoRecord: autoRecord.checked });
});

langSelect.addEventListener("change", () => {
  void chrome.storage.local.set({ langSelect: langSelect.value });
});

btnSetupMic.addEventListener("click", openSetupPage);

btnOptions?.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

bindProviderControls({
  providerSelect,
  apiKeyRow,
  apiKeyHint,
  apiKeyInput,
  btnSaveKey,
});

chrome.storage.onChanged.addListener((changes) => {
  void loadRecordings(ui);
  if (changes.selectedMicDeviceId) {
    void populateMicrophones(micSelect, btnSetupMic);
  }
});

void (async () => {
  await restoreProviderSettings(providerSelect, apiKeyInput, apiKeyRow, apiKeyHint);

  const saved = await chrome.storage.local.get(["autoRecord", "includeVideo", "langSelect"]);
  autoRecord.checked = Boolean(saved.autoRecord);
  includeVideo.checked = Boolean(saved.includeVideo);
  if (typeof saved.langSelect === "string") {
    langSelect.value = saved.langSelect;
  }

  await populateMicrophones(micSelect, btnSetupMic);
  await Promise.all([
    refreshMeetState(meetStatus, callStatus),
    refreshRecordingState(recStatus, btnStart, btnStop),
    refreshServer(serverStatus),
    loadRecordings(ui),
  ]);
})();
