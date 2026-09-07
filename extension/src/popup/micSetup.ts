export function fillMicDropdown(micSelect: HTMLSelectElement, mics: MediaDeviceInfo[]): void {
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

export function openSetupPage(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
}

export async function populateMicrophones(
  micSelect: HTMLSelectElement,
  btnSetupMic: HTMLButtonElement,
): Promise<void> {
  const stored = await chrome.storage.local.get(["selectedMicDeviceId", "selectedMicLabel"]);
  if (stored.selectedMicDeviceId) {
    const opt = document.createElement("option");
    opt.value = stored.selectedMicDeviceId as string;
    opt.textContent = (stored.selectedMicLabel as string) || "Saved microphone";
    micSelect.append(opt);
    micSelect.value = stored.selectedMicDeviceId as string;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");
    const hasLabels = mics.some((m) => m.label);

    if (hasLabels && mics.length > 0) {
      fillMicDropdown(micSelect, mics);
      if (stored.selectedMicDeviceId) {
        const exists = Array.from(micSelect.options).some(
          (o) => o.value === stored.selectedMicDeviceId,
        );
        if (exists) micSelect.value = stored.selectedMicDeviceId as string;
      }
      return;
    }
  } catch {
    // enumerateDevices not available or failed
  }

  if (!stored.selectedMicDeviceId) {
    btnSetupMic.classList.remove("hidden");
  }
}
