/** Save a blob via Chrome's download UI (works from popup and service worker). */
export async function downloadBlobWithChrome(blob: Blob, filename: string): Promise<void> {
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
}

/** Simple anchor download (popup / pages with DOM only). */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
