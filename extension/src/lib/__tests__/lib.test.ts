import { describe, expect, it, vi, beforeEach } from "vitest";
import { MSG } from "../messages";
import {
  buildTabCaptureConstraints,
  pickMimeType,
} from "../recorder";
import {
  exportTranscript,
  formatSegmentsPlain,
  formatSegmentsSrt,
  formatSegmentsTxt,
  formatSegmentsVtt,
  formatTimestamp,
} from "../transcriptExport";
import type { TranscriptSegment } from "../types";
import { DEFAULT_SERVER_BASE, getServerBase } from "../settings";

const sampleSegments: TranscriptSegment[] = [
  { speaker: "Speaker 1", start: 0, end: 1.5, text: "Hello there" },
  { speaker: "Speaker 2", start: 1.5, end: 3.25, text: "Hi!" },
];

describe("messages", () => {
  it("exposes stable message type constants", () => {
    expect(MSG.START_RECORDING).toBe("START_RECORDING");
    expect(MSG.TRANSCRIBE).toBe("TRANSCRIBE");
    expect(MSG.MEET_STATE).toBe("MEET_STATE");
  });
});

describe("recorder", () => {
  beforeEach(() => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (t: string) => t.includes("webm"),
    });
  });

  it("picks a video mime type when video is requested", () => {
    expect(pickMimeType(true)).toMatch(/video\/webm/);
  });

  it("picks an audio mime type when video is not requested", () => {
    expect(pickMimeType(false)).toMatch(/audio\/webm/);
  });

  it("builds tab capture constraints without video", () => {
    const c = buildTabCaptureConstraints("stream-123", false);
    expect(c.video).toBe(false);
    expect(c.audio).toBeTruthy();
  });

  it("builds tab capture constraints with video", () => {
    const c = buildTabCaptureConstraints("stream-123", true);
    expect(c.video).toBeTruthy();
    expect(c.audio).toBeTruthy();
  });
});

describe("transcriptExport", () => {
  it("formats timestamps for SRT and VTT", () => {
    expect(formatTimestamp(65.5, ",")).toBe("00:01:05,500");
    expect(formatTimestamp(65.5, ".")).toBe("00:01:05.500");
  });

  it("formats plain and txt transcripts", () => {
    expect(formatSegmentsPlain(sampleSegments)).toContain("Speaker 1:");
    expect(formatSegmentsTxt(sampleSegments)).toContain("Hello there");
  });

  it("formats SRT with indices and arrows", () => {
    const srt = formatSegmentsSrt(sampleSegments);
    expect(srt).toContain("1\n");
    expect(srt).toContain("-->");
  });

  it("formats VTT with WEBVTT header", () => {
    expect(formatSegmentsVtt(sampleSegments).startsWith("WEBVTT")).toBe(true);
  });

  it("exports JSON and txt packages", () => {
    const json = exportTranscript(sampleSegments, "json");
    expect(json.extension).toBe("json");
    expect(JSON.parse(json.content)).toHaveLength(2);

    const txt = exportTranscript(sampleSegments, "txt");
    expect(txt.mimeType).toBe("text/plain");
  });
});

describe("settings", () => {
  it("exposes the default server base", () => {
    expect(DEFAULT_SERVER_BASE).toBe("http://127.0.0.1:5055");
    expect(getServerBase()).toBe(DEFAULT_SERVER_BASE);
  });
});
