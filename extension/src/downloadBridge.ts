/**
 * Short-lived extension tab: blob URL + chrome.downloads are not available in the
 * service worker or offscreen document; this full extension page performs the save.
 */
import { getRecordingBlob } from "./lib/storage.js";

async function main(): Promise<void> {
  const params = new URLSearchParams(globalThis.location.search);
  const id = params.get("id");
  const filename = params.get("filename") || "meet-recording.webm";
  if (!id) {
    globalThis.close();
    return;
  }

  try {
    const blob = await getRecordingBlob(id);
    if (!blob) {
      console.error("downloadBridge: blob not found for", id);
      globalThis.close();
      return;
    }
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url,
        filename,
        saveAs: true,
      });
    } finally {
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    }
  } catch (e) {
    console.error("downloadBridge:", e);
  }
  globalThis.setTimeout(() => globalThis.close(), 400);
}

void main();
