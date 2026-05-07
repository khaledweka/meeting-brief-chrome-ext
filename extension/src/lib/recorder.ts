export function pickMimeType(includeVideo: boolean): string | undefined {
  if (includeVideo) {
    // Prefer explicit Opus audio; bare "video/webm" can be video-only on some Chrome builds.
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"];
    const MR = globalThis.MediaRecorder;
    for (const c of candidates) {
      if (typeof MR !== "undefined" && MR.isTypeSupported(c)) {
        return c;
      }
    }
    return undefined;
  }
  const audioCandidates = ["audio/webm;codecs=opus", "audio/webm"];
  const MR = globalThis.MediaRecorder;
  for (const c of audioCandidates) {
    if (typeof MR !== "undefined" && MR.isTypeSupported(c)) {
      return c;
    }
  }
  return undefined;
}

export function buildTabCaptureConstraints(
  streamId: string,
  includeVideo: boolean,
): MediaStreamConstraints {
  const audio: Record<string, unknown> = {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
    },
  };
  if (!includeVideo) {
    return { audio: audio as MediaTrackConstraints, video: false };
  }
  const video: Record<string, unknown> = {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
    },
  };
  return {
    audio: audio as MediaTrackConstraints,
    video: video as MediaTrackConstraints,
  };
}
