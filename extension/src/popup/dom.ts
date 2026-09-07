export function setText(el: HTMLElement, text: string, cls?: string): void {
  el.textContent = text;
  el.className = cls ? `value ${cls}` : "value";
}

export function showError(el: HTMLParagraphElement, msg: string | null): void {
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function getActiveMeetTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("meet.google.com")) {
    return null;
  }
  return tab.id;
}

export async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

export function parseProvider(value: string): { provider: string; model?: string } {
  const [provider, model] = value.split(":");
  return { provider, model };
}

export function getProviderBase(value: string): string {
  return value.split(":")[0];
}
