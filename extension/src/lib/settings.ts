/** Must match server default PORT (5055 avoids Windows blocking port 5000). */
export const DEFAULT_SERVER_BASE = "http://127.0.0.1:5055";

const SERVER_BASE_KEY = "serverBaseUrl";

/** Resolve the transcription server base URL (options page override or default). */
export async function resolveServerBase(): Promise<string> {
  try {
    const stored = await chrome.storage.local.get(SERVER_BASE_KEY);
    const value = stored[SERVER_BASE_KEY];
    if (typeof value === "string" && value.trim()) {
      return value.replace(/\/$/, "");
    }
  } catch {
    /* storage unavailable (tests / non-extension context) */
  }
  return DEFAULT_SERVER_BASE;
}

/** Synchronous fallback used when callers cannot await (prefer resolveServerBase). */
export function getServerBase(): string {
  return DEFAULT_SERVER_BASE;
}

export async function setServerBase(url: string): Promise<void> {
  const cleaned = url.trim().replace(/\/$/, "");
  await chrome.storage.local.set({ [SERVER_BASE_KEY]: cleaned || DEFAULT_SERVER_BASE });
}
