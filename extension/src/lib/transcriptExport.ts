import type { TranscriptSegment } from "./types.js";

/** Format seconds as SRT/VTT timestamp (HH:MM:SS,mmm or HH:MM:SS.mmm). */
export function formatTimestamp(seconds: number, separator: "," | "." = ","): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`;
}

export function formatSegmentsPlain(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${s.start.toFixed(1)}s–${s.end.toFixed(1)}s] ${s.speaker}: ${s.text.trim()}`)
    .join("\n");
}

export function formatSegmentsTxt(segments: TranscriptSegment[]): string {
  return segments.map((s) => `${s.speaker}: ${s.text.trim()}`).join("\n\n");
}

export function formatSegmentsSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((s, i) => {
      const start = formatTimestamp(s.start, ",");
      const end = formatTimestamp(s.end, ",");
      return `${i + 1}\n${start} --> ${end}\n${s.speaker}: ${s.text.trim()}\n`;
    })
    .join("\n");
}

export function formatSegmentsVtt(segments: TranscriptSegment[]): string {
  const body = segments
    .map((s) => {
      const start = formatTimestamp(s.start, ".");
      const end = formatTimestamp(s.end, ".");
      return `${start} --> ${end}\n${s.speaker}: ${s.text.trim()}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function formatSegmentsJson(segments: TranscriptSegment[]): string {
  return JSON.stringify(segments, null, 2);
}

export type ExportFormat = "txt" | "srt" | "vtt" | "json";

export function exportTranscript(
  segments: TranscriptSegment[],
  format: ExportFormat,
): { content: string; mimeType: string; extension: string } {
  switch (format) {
    case "srt":
      return { content: formatSegmentsSrt(segments), mimeType: "application/x-subrip", extension: "srt" };
    case "vtt":
      return { content: formatSegmentsVtt(segments), mimeType: "text/vtt", extension: "vtt" };
    case "json":
      return { content: formatSegmentsJson(segments), mimeType: "application/json", extension: "json" };
    case "txt":
    default:
      return { content: formatSegmentsTxt(segments), mimeType: "text/plain", extension: "txt" };
  }
}
