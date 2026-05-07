const btnGrant = document.getElementById("btnGrant") as HTMLButtonElement;
const grantStatus = document.getElementById("grantStatus") as HTMLDivElement;
const step2 = document.getElementById("step2") as HTMLDivElement;
const micList = document.getElementById("micList") as HTMLSelectElement;
const btnSave = document.getElementById("btnSave") as HTMLButtonElement;
const saveStatus = document.getElementById("saveStatus") as HTMLDivElement;

function showStatus(el: HTMLDivElement, msg: string, type: "ok" | "err" | "info"): void {
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove("hidden");
}

async function enumerateMics(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput");
}

async function populateMicList(): Promise<void> {
  const mics = await enumerateMics();
  micList.innerHTML = "";
  for (const mic of mics) {
    const opt = document.createElement("option");
    opt.value = mic.deviceId;
    opt.textContent = mic.label || `Microphone (${mic.deviceId.slice(0, 12)})`;
    micList.append(opt);
  }

  // Restore previously saved selection
  const stored = await chrome.storage.local.get("selectedMicDeviceId");
  if (stored.selectedMicDeviceId) {
    const exists = Array.from(micList.options).some((o) => o.value === stored.selectedMicDeviceId);
    if (exists) micList.value = stored.selectedMicDeviceId;
  }
}

btnGrant.addEventListener("click", async () => {
  btnGrant.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    showStatus(grantStatus, "Microphone access granted!", "ok");
    step2.classList.remove("hidden");
    await populateMicList();
  } catch (e) {
    showStatus(grantStatus, `Permission denied: ${e}. Click the lock/camera icon in the address bar and allow microphone.`, "err");
  } finally {
    btnGrant.disabled = false;
  }
});

btnSave.addEventListener("click", async () => {
  const deviceId = micList.value;
  const label = micList.options[micList.selectedIndex]?.textContent || "";
  await chrome.storage.local.set({ selectedMicDeviceId: deviceId, selectedMicLabel: label });
  showStatus(saveStatus, `Saved: ${label}. You can close this tab and start recording.`, "ok");
  globalThis.setTimeout(() => globalThis.close(), 1500);
});

// Auto-check if permission already granted
void (async () => {
  try {
    const mics = await enumerateMics();
    const hasLabels = mics.some((m) => m.label);
    if (hasLabels && mics.length > 0) {
      showStatus(grantStatus, "Microphone access already granted!", "ok");
      step2.classList.remove("hidden");
      await populateMicList();
    }
  } catch {
    // Permission not yet granted
  }
})();
