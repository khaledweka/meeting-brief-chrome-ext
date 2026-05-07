export type RecordingMode = "audio" | "video";

export interface RecordingMeta {
  id: string;
  createdAt: number;
  durationMs: number;
  mode: RecordingMode;
  sizeBytes: number;
  transcript?: TranscriptResult;
}

export interface TranscriptSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  segments: TranscriptSegment[];
  language?: string;
  model?: string;
}

export type MeetStatePayload = {
  inMeeting: boolean;
  url: string;
};
