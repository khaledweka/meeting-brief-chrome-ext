import type { TranscriptResult } from "./types.js";

/** Must match server default PORT (5055 avoids Windows blocking port 5000). */
const DEFAULT_BASE = "http://127.0.0.1:5055";

export function getServerBase(): string {
  return DEFAULT_BASE;
}

export type HealthResult =
  | { reachable: true; ffmpeg: boolean }
  | { reachable: false; ffmpeg: false };

export async function fetchHealth(): Promise<HealthResult> {
  try {
    const res = await fetch(`${getServerBase()}/health`, { method: "GET" });
    if (!res.ok) {
      return { reachable: false, ffmpeg: false };
    }
    const data = (await res.json()) as { ok?: boolean; ffmpeg?: boolean };
    return { reachable: true, ffmpeg: Boolean(data.ffmpeg) };
  } catch {
    return { reachable: false, ffmpeg: false };
  }
}

/** True if the transcription server responds (any health payload). */
export async function checkHealth(): Promise<boolean> {
  const h = await fetchHealth();
  return h.reachable;
}

function parseServerErrorBody(body: string, status: number): string {
  const trimmed = body.trim();
  try {
    const j = JSON.parse(trimmed) as { error?: string };
    if (typeof j.error === "string" && j.error.length > 0) {
      return j.error;
    }
  } catch {
    /* not JSON */
  }
  if (trimmed.includes("<title>") || trimmed.includes("<!doctype")) {
    const m = trimmed.match(/<p>([^<]+)<\/p>/i);
    if (m?.[1]) {
      return `Server error (${status}): ${m[1].trim()}`;
    }
    return `Server error (${status}); check the transcription server terminal for a Python traceback.`;
  }
  return trimmed || `Request failed (${status})`;
}

export interface TranscribeOptions {
  language?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
}

export async function transcribeRecording(
  blob: Blob,
  opts?: TranscribeOptions,
): Promise<TranscriptResult> {
  const form = new FormData();
  form.append("file", blob, "recording.webm");
  if (opts?.language) {
    form.append("language", opts.language);
  }
  if (opts?.provider) {
    form.append("provider", opts.provider);
  }
  if (opts?.model) {
    form.append("model", opts.model);
  }
  if (opts?.apiKey) {
    form.append("api_key", opts.apiKey);
  }
  const res = await fetch(`${getServerBase()}/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseServerErrorBody(text, res.status));
  }
  return (await res.json()) as TranscriptResult;
}
