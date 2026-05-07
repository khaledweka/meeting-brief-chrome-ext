import { MSG } from "./lib/messages.js";
import { buildTabCaptureConstraints, pickMimeType } from "./lib/recorder.js";
import { saveRecordingBlob } from "./lib/storage.js";
import type { RecordingMode } from "./lib/types.js";

let mediaRecorder: MediaRecorder | null = null;
let capturedStream: MediaStream | null = null;
let tabStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let tabMonitor: HTMLAudioElement | null = null;
let chunks: Blob[] = [];
let startTs = 0;
let currentRecordingId = "";
let currentMode: RecordingMode = "audio";

function stopAllTracks(): void {
  tabMonitor?.pause();
  tabMonitor = null;
  capturedStream?.getTracks().forEach((t) => t.stop());
  tabStream?.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop());
  capturedStream = null;
  tabStream = null;
  micStream = null;
}

async function closeAudioCtx(): Promise<void> {
  if (audioCtx) {
    await audioCtx.close().catch(() => undefined);
    audioCtx = null;
  }
}

async function getMicStream(deviceId: string): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (err) {
    console.warn("[MeetingBrief] Mic capture failed, recording tab audio only:", err);
    return null;
  }
}

async function startRecording(
  streamId: string,
  includeVideo: boolean,
  recordingId: string,
  micDeviceId: string,
): Promise<void> {
  stopAllTracks();
  await closeAudioCtx();
  mediaRecorder?.stop();
  chunks = [];
  currentRecordingId = recordingId;
  currentMode = includeVideo ? "video" : "audio";
  startTs = performance.now();

  // #region agent log
  fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-D',location:'offscreen.ts:startRecording-entry',message:'startRecording called',data:{micDeviceId,includeVideo,streamIdLen:streamId.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const constraints = buildTabCaptureConstraints(streamId, includeVideo);
  tabStream = await navigator.mediaDevices.getUserMedia(
    constraints as MediaStreamConstraints,
  );

  const tabAudio = tabStream.getAudioTracks();
  const tabVideo = tabStream.getVideoTracks();
  console.log(
    `[MeetingBrief] Tab capture: ${tabAudio.length} audio, ${tabVideo.length} video`,
  );

  // Chrome redirects tab audio exclusively to the capture stream, silencing speakers.
  // Play it back through an audio element so the user can still hear during recording.
  if (tabAudio.length > 0) {
    tabMonitor = document.createElement("audio");
    tabMonitor.srcObject = new MediaStream(tabAudio);
    tabMonitor.volume = 1.0;
    tabMonitor.play().catch((e) => console.warn("[MeetingBrief] Tab monitor play failed:", e));
  }

  // #region agent log
  fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-A H-B',location:'offscreen.ts:tabStream-tracks',message:'Tab stream tracks',data:{tabAudioCount:tabAudio.length,tabVideoCount:tabVideo.length,tabAudioTracks:tabAudio.map(t=>({id:t.id,muted:t.muted,enabled:t.enabled,readyState:t.readyState,label:t.label}))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // If mic requested, mix tab audio + mic audio via AudioContext
  if (micDeviceId) {
    micStream = await getMicStream(micDeviceId);
  }

  if (micStream && micStream.getAudioTracks().length > 0) {
    console.log("[MeetingBrief] Mixing tab audio + mic audio via AudioContext");
    audioCtx = new AudioContext();
    // Offscreen docs may start AudioContext suspended; force resume

    // #region agent log
    fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-C',location:'offscreen.ts:audioCtx-before-resume',message:'AudioContext state before resume',data:{state:audioCtx.state},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    console.log(`[MeetingBrief] AudioContext state: ${audioCtx.state}`);

    // #region agent log
    fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-C',location:'offscreen.ts:audioCtx-after-resume',message:'AudioContext state after resume',data:{state:audioCtx.state},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const dest = audioCtx.createMediaStreamDestination();

    let _dbgTabAnalyser: AnalyserNode | null = null;
    if (tabAudio.length > 0) {
      // #region agent log
      fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-E H-F',location:'offscreen.ts:tabSrc-connect',message:'Connecting tab audio source to destination',data:{tracksWrapped:tabAudio.length,usingOriginalStream:true},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const tabSrc = audioCtx.createMediaStreamSource(tabStream);
      tabSrc.connect(dest);
      // #region agent log
      _dbgTabAnalyser = audioCtx.createAnalyser();
      tabSrc.connect(_dbgTabAnalyser);
      // #endregion
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-A',location:'offscreen.ts:tabSrc-skipped',message:'SKIPPED: tabAudio.length is 0, tab audio NOT connected',data:{tabAudioCount:tabAudio.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }

    const micSrc = audioCtx.createMediaStreamSource(micStream);
    micSrc.connect(dest);
    // #region agent log
    const _dbgMicAnalyser = audioCtx.createAnalyser();
    micSrc.connect(_dbgMicAnalyser);
    globalThis.setTimeout(() => {
      const tData = new Float32Array(_dbgTabAnalyser ? _dbgTabAnalyser.fftSize : 0);
      if (_dbgTabAnalyser) { _dbgTabAnalyser.getFloatTimeDomainData(tData); }
      const tabRms = tData.length ? Math.sqrt(tData.reduce((s,v)=>s+v*v,0)/tData.length) : -1;
      const mData = new Float32Array(_dbgMicAnalyser.fftSize);
      _dbgMicAnalyser.getFloatTimeDomainData(mData);
      const micRms = Math.sqrt(mData.reduce((s,v)=>s+v*v,0)/mData.length);
      fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-F H-G H-H',location:'offscreen.ts:analyser-sample-2s',message:'Audio RMS levels 2s after recording start',data:{tabRms:+tabRms.toFixed(6),micRms:+micRms.toFixed(6),tabSilent:tabRms<0.001,micSilent:micRms<0.001},timestamp:Date.now()})}).catch(()=>{});
    }, 2000);
    // #endregion

    const mixedAudio = dest.stream.getAudioTracks();
    console.log(`[MeetingBrief] Mixed audio tracks: ${mixedAudio.length}`);

    capturedStream = new MediaStream([
      ...mixedAudio,
      ...(includeVideo ? tabVideo : []),
    ]);
  } else {
    // No mic — use the raw tab capture stream directly
    console.log("[MeetingBrief] No mic — recording tab audio only");
    capturedStream = tabStream;
  }

  const audioTracks = capturedStream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.warn("[MeetingBrief] WARNING: no audio tracks to record");
  }

  const mimeType = pickMimeType(includeVideo);
  console.log(`[MeetingBrief] mimeType: ${mimeType ?? "(browser default)"}`);

  mediaRecorder = mimeType
    ? new MediaRecorder(capturedStream, { mimeType })
    : new MediaRecorder(capturedStream);

  mediaRecorder.ondataavailable = (ev: BlobEvent) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  mediaRecorder.onerror = (ev) => {
    console.error("[MeetingBrief] MediaRecorder error", ev);
  };

  mediaRecorder.start(1000);
  console.log("[MeetingBrief] Recording started");
}

async function stopRecording(): Promise<void> {
  const recorder = mediaRecorder;
  const id = currentRecordingId;
  const mode = currentMode;
  const started = startTs;

  mediaRecorder = null;
  currentRecordingId = "";

  if (!recorder || recorder.state === "inactive") {
    stopAllTracks();
    await closeAudioCtx();
    return;
  }

  await new Promise<void>((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.stop();
  });
  stopAllTracks();
  await closeAudioCtx();

  const durationMs = Math.max(0, Math.round(performance.now() - started));
  const blob = new Blob(chunks, { type: recorder.mimeType || "application/octet-stream" });
  chunks = [];
  console.log(
    `[MeetingBrief] Stopped: ${(blob.size / 1024 / 1024).toFixed(1)} MB, ${(durationMs / 1000).toFixed(0)}s, mime=${blob.type}`,
  );

  await saveRecordingBlob(id, blob);

  await chrome.runtime.sendMessage({
    type: MSG.RECORDING_COMPLETE,
    payload: {
      id,
      durationMs,
      mode,
      sizeBytes: blob.size,
      createdAt: Date.now(),
    },
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MSG.OFFSCREEN_RECORD_START) {
    const { streamId, includeVideo, recordingId, micDeviceId } = message.payload as {
      streamId: string;
      includeVideo: boolean;
      recordingId: string;
      micDeviceId: string;
    };
    void startRecording(streamId, includeVideo, recordingId, micDeviceId)
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => {
        console.error(err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }
  if (message?.type === MSG.OFFSCREEN_RECORD_STATE) {
    const recorderState = mediaRecorder?.state ?? "none";
    const isRecording = mediaRecorder != null && recorderState !== "inactive";
    // #region agent log
    fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-L H-M H-N',location:'offscreen.ts:record-state',message:'Offscreen recorder state requested',data:{isRecording,recorderState,currentRecordingId,currentMode,chunks:chunks.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    sendResponse({
      ok: true,
      recordingActive: isRecording,
      recorderState,
      recordingId: currentRecordingId,
      mode: currentMode,
    });
    return false;
  }
  if (message?.type === MSG.OFFSCREEN_RECORD_STOP) {
    void stopRecording()
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => {
        console.error(err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }
  return false;
});

globalThis.setTimeout(() => {
  void chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_READY });
}, 0);
