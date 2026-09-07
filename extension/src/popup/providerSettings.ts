const API_KEY_HINTS: Record<string, string> = {
  gemini: "Get free key at aistudio.google.com/apikey — each model has separate quota!",
  openai: "Get key at platform.openai.com/api-keys",
  lmstudio: "",
};

export function updateProviderUI(
  providerSelect: HTMLSelectElement,
  apiKeyRow: HTMLElement,
  apiKeyHint: HTMLElement,
): void {
  const base = providerSelect.value.split(":")[0];
  const isCloud = base === "gemini" || base === "openai";
  apiKeyRow.classList.toggle("hidden", !isCloud);
  apiKeyHint.textContent = API_KEY_HINTS[base] || "";
}

export async function restoreProviderSettings(
  providerSelect: HTMLSelectElement,
  apiKeyInput: HTMLInputElement,
  apiKeyRow: HTMLElement,
  apiKeyHint: HTMLElement,
): Promise<void> {
  const saved = await chrome.storage.local.get(["transcribeProvider"]);
  if (typeof saved.transcribeProvider === "string") {
    providerSelect.value = saved.transcribeProvider;
  }
  updateProviderUI(providerSelect, apiKeyRow, apiKeyHint);

  const providerBase = providerSelect.value.split(":")[0];
  if (providerBase === "gemini" || providerBase === "openai") {
    const keys = await chrome.storage.local.get(`apiKey_${providerBase}`);
    if (keys[`apiKey_${providerBase}`]) {
      apiKeyInput.placeholder = "••• key saved •••";
    }
  }
}

export function bindProviderControls(opts: {
  providerSelect: HTMLSelectElement;
  apiKeyRow: HTMLElement;
  apiKeyHint: HTMLElement;
  apiKeyInput: HTMLInputElement;
  btnSaveKey: HTMLButtonElement;
}): void {
  const { providerSelect, apiKeyRow, apiKeyHint, apiKeyInput, btnSaveKey } = opts;

  providerSelect.addEventListener("change", () => {
    updateProviderUI(providerSelect, apiKeyRow, apiKeyHint);
    void chrome.storage.local.set({ transcribeProvider: providerSelect.value });
  });

  btnSaveKey.addEventListener("click", async () => {
    const base = providerSelect.value.split(":")[0];
    const key = apiKeyInput.value.trim();
    if (!key) return;
    await chrome.storage.local.set({ [`apiKey_${base}`]: key });
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "••• key saved •••";
    btnSaveKey.textContent = "Saved!";
    globalThis.setTimeout(() => {
      btnSaveKey.textContent = "Save";
    }, 1500);
  });
}
