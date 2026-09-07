import { DEFAULT_SERVER_BASE, setServerBase } from "../lib/settings.js";

const serverBaseUrl = document.getElementById("serverBaseUrl") as HTMLInputElement;
const defaultProvider = document.getElementById("defaultProvider") as HTMLSelectElement;
const defaultLanguage = document.getElementById("defaultLanguage") as HTMLSelectElement;
const autoRecord = document.getElementById("autoRecord") as HTMLInputElement;
const includeVideo = document.getElementById("includeVideo") as HTMLInputElement;
const btnSave = document.getElementById("btnSave") as HTMLButtonElement;
const btnReset = document.getElementById("btnReset") as HTMLButtonElement;
const saveStatus = document.getElementById("saveStatus") as HTMLParagraphElement;

function flash(msg: string): void {
  saveStatus.hidden = false;
  saveStatus.textContent = msg;
  globalThis.setTimeout(() => {
    saveStatus.hidden = true;
  }, 2000);
}

async function load(): Promise<void> {
  const saved = await chrome.storage.local.get([
    "serverBaseUrl",
    "transcribeProvider",
    "langSelect",
    "autoRecord",
    "includeVideo",
  ]);
  serverBaseUrl.value =
    typeof saved.serverBaseUrl === "string" && saved.serverBaseUrl
      ? saved.serverBaseUrl
      : DEFAULT_SERVER_BASE;
  if (typeof saved.transcribeProvider === "string") {
    defaultProvider.value = saved.transcribeProvider;
  }
  if (typeof saved.langSelect === "string") {
    defaultLanguage.value = saved.langSelect;
  }
  autoRecord.checked = Boolean(saved.autoRecord);
  includeVideo.checked = Boolean(saved.includeVideo);
}

btnSave.addEventListener("click", async () => {
  await setServerBase(serverBaseUrl.value || DEFAULT_SERVER_BASE);
  await chrome.storage.local.set({
    transcribeProvider: defaultProvider.value,
    langSelect: defaultLanguage.value,
    autoRecord: autoRecord.checked,
    includeVideo: includeVideo.checked,
  });
  flash("Saved.");
});

btnReset.addEventListener("click", async () => {
  await setServerBase(DEFAULT_SERVER_BASE);
  await chrome.storage.local.set({
    transcribeProvider: "whisper-local",
    langSelect: "",
    autoRecord: false,
    includeVideo: false,
  });
  await load();
  flash("Reset to defaults.");
});

void load();
