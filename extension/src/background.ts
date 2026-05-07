import { transcribeRecording, type TranscribeOptions } from "./lib/api.js";
import { MSG } from "./lib/messages.js";
import {
  getRecordingBlob,
  listRecordingMeta,
  removeRecording,
  updateRecordingTranscript,
  upsertRecordingMeta,
} from "./lib/storage.js";
import type { MeetStatePayload, RecordingMeta } from "./lib/types.js";

type MeetState = MeetStatePayload & { tabId: number };

let lastMeet: MeetState | null = null;
let recordingActive = false;
let recordingTabId: number | null = null;

// #region agent log - detect SW restarts and restore state
void (async () => {
  const saved = await chrome.storage.session.get(["recordingActive", "recordingTabId"]);
  const wasActive = Boolean(saved.recordingActive);
  if (wasActive) {
    recordingActive = true;
    recordingTabId = (saved.recordingTabId as number | null) ?? null;
  }
  fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-I',location:'background.ts:sw-startup',message:'SW started/restarted',data:{restoredRecordingActive:wasActive,recordingTabId},timestamp:Date.now()})}).catch(()=>{});
})();
// #endregion

function meetStateResponse(): MeetState | null {
  return lastMeet;
}

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const listener = (msg: { type?: string }) => {
        if (msg?.type === MSG.OFFSCREEN_READY) {
          settled = true;
          globalThis.clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(listener);
          resolve();
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      const timeoutId = globalThis.setTimeout(() => {
        if (settled) return;
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error("Timed out waiting for offscreen document."));
      }, 10_000);
      void chrome.offscreen
        .createDocument({
          url: chrome.runtime.getURL("offscreen.html"),
          reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
          justification:
            "Record tab audio/video using tabCapture and MediaRecorder, and play back captured tab audio to speakers so participants can still be heard during recording.",
        })
        .catch((e) => {
          if (settled) return;
          settled = true;
          globalThis.clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(listener);
          reject(e);
        });
    });
}

async function closeOffscreenIfIdle(): Promise<void> {
  if (!recordingActive && (await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.closeDocument();
  }
}

async function getOffscreenRecordingState(): Promise<{
  ok: boolean;
  recordingActive: boolean;
  recorderState?: string;
  mode?: string;
}> {
  const offscreenExists = await chrome.offscreen.hasDocument();
  if (!offscreenExists) {
    return { ok: true, recordingActive: false, recorderState: "no-offscreen" };
  }
  try {
    const res = (await chrome.runtime.sendMessage({
      type: MSG.OFFSCREEN_RECORD_STATE,
    })) as { ok?: boolean; recordingActive?: boolean; recorderState?: string; mode?: string };
    return {
      ok: Boolean(res?.ok),
      recordingActive: Boolean(res?.recordingActive),
      recorderState: res?.recorderState,
      mode: res?.mode,
    };
  } catch (e) {
    // #region agent log
    fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-L H-M H-N',location:'background.ts:getOffscreenRecordingState-error',message:'Failed to query offscreen recorder state',data:{error:String(e)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { ok: false, recordingActive: false, recorderState: "query-error" };
  }
}

async function startRecording(
  tabId: number,
  includeVideo: boolean,
  micDeviceId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const offscreenState = await getOffscreenRecordingState();
  if (recordingActive || offscreenState.recordingActive) {
    return { ok: false, error: "Recording already in progress." };
  }
  try {
    await ensureOffscreen();
    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        const err = chrome.runtime.lastError;
        if (err?.message) {
          reject(new Error(err.message));
          return;
        }
        if (!id) {
          reject(new Error("No stream id returned from tabCapture."));
          return;
        }
        resolve(id);
      });
    });
    const recordingId = crypto.randomUUID();
    recordingActive = true;
    recordingTabId = tabId;
    await chrome.storage.session.set({ recordingActive: true, recordingTabId: tabId });

    const res = (await chrome.runtime.sendMessage({
      type: MSG.OFFSCREEN_RECORD_START,
      payload: { streamId, includeVideo, recordingId, micDeviceId: micDeviceId || "" },
    })) as { ok?: boolean; error?: string };

    if (!res?.ok) {
      recordingActive = false;
      recordingTabId = null;
      await chrome.storage.session.set({ recordingActive: false, recordingTabId: null });
      await closeOffscreenIfIdle();
      return { ok: false, error: res?.error || "Failed to start offscreen recorder." };
    }
    return { ok: true };
  } catch (e) {
    recordingActive = false;
    recordingTabId = null;
    await chrome.storage.session.set({ recordingActive: false, recordingTabId: null });
    await closeOffscreenIfIdle();
    return { ok: false, error: String(e) };
  }
}

async function stopRecording(): Promise<{ ok: boolean; error?: string }> {
  const offscreenExists = await chrome.offscreen.hasDocument();
  const offscreenState = await getOffscreenRecordingState();

  // #region agent log
  fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-I H-J H-L H-M H-N',location:'background.ts:stopRecording-entry',message:'stopRecording called',data:{recordingActive,offscreenExists,offscreenRecordingActive:offscreenState.recordingActive,offscreenRecorderState:offscreenState.recorderState},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // The offscreen document is the source of truth; MV3 can restart this SW at any time.
  if (!recordingActive && !offscreenState.recordingActive) {
    return { ok: false, error: "No active recording." };
  }

  try {
    const res = (await chrome.runtime.sendMessage({
      type: MSG.OFFSCREEN_RECORD_STOP,
    })) as { ok?: boolean; error?: string };
    if (!res?.ok) {
      return { ok: false, error: res?.error || "Failed to stop recorder." };
    }
    return { ok: true };
  } finally {
    recordingActive = false;
    recordingTabId = null;
    await chrome.storage.session.set({ recordingActive: false, recordingTabId: null });
    await closeOffscreenIfIdle();
  }
}

async function onRecordingComplete(payload: Omit<RecordingMeta, "transcript">): Promise<void> {
  const meta: RecordingMeta = {
    id: payload.id,
    createdAt: payload.createdAt,
    durationMs: payload.durationMs,
    mode: payload.mode,
    sizeBytes: payload.sizeBytes,
  };
  await upsertRecordingMeta(meta);

  if (meta.mode !== "video") {
    return;
  }

  const stamp = new Date(meta.createdAt).toISOString().replace(/[:.]/g, "-");
  const filename = `meet-recording-${stamp}.webm`;

  // SW and offscreen cannot use chrome.downloads. Open a minimal extension tab that can.
  await new Promise<void>((r) => globalThis.setTimeout(r, 0));
  // #region agent log
  fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-K',location:'background.ts:onRecordingComplete-download',message:'Attempting download tab creation',data:{id:meta.id,filename,mode:meta.mode,sizeBytes:meta.sizeBytes},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const page = new URL(chrome.runtime.getURL("download.html"));
    page.searchParams.set("id", meta.id);
    page.searchParams.set("filename", filename);
    await chrome.tabs.create({ url: page.href, active: false });
    // #region agent log
    fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-K',location:'background.ts:onRecordingComplete-download-ok',message:'Download tab created successfully',data:{filename},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch (e) {
    // #region agent log
    fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-K',location:'background.ts:onRecordingComplete-download-err',message:'Download tab creation FAILED',data:{error:String(e)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.error("Could not start download tab:", e);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type as string | undefined;

  if (type === MSG.RECORDING_COMPLETE) {
    void onRecordingComplete(message.payload as Omit<RecordingMeta, "transcript">);
    return false;
  }

  if (type === MSG.MEET_STATE && sender.tab?.id != null) {
    const payload = message.payload as MeetStatePayload;
    lastMeet = { ...payload, tabId: sender.tab.id };
    sendResponse({ ok: true });
    return false;
  }

  if (type === MSG.GET_MEET_STATE) {
    sendResponse({ ok: true, meet: meetStateResponse() });
    return false;
  }

  if (type === MSG.GET_RECORDING_STATE) {
    void (async () => {
      const offscreenState = await getOffscreenRecordingState();
      const active = recordingActive || offscreenState.recordingActive;
      if (active !== recordingActive) {
        recordingActive = active;
        await chrome.storage.session.set({ recordingActive: active, recordingTabId });
      }
      // #region agent log
      fetch('http://127.0.0.1:7310/ingest/102403f7-bf47-4ea6-953b-8e431b8bd6e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1b634'},body:JSON.stringify({sessionId:'b1b634',hypothesisId:'H-L',location:'background.ts:get-recording-state',message:'Popup requested recording state',data:{memoryRecordingActive:recordingActive,offscreenRecordingActive:offscreenState.recordingActive,offscreenRecorderState:offscreenState.recorderState,active},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      sendResponse({ ok: true, recordingActive: active, recordingTabId });
    })();
    return true;
  }

  if (type === MSG.START_RECORDING) {
    const { tabId, includeVideo, micDeviceId } = message.payload as {
      tabId: number;
      includeVideo: boolean;
      micDeviceId?: string;
    };
    void startRecording(tabId, includeVideo, micDeviceId).then((r) => sendResponse(r));
    return true;
  }

  if (type === MSG.STOP_RECORDING) {
    void stopRecording().then((r) => sendResponse(r));
    return true;
  }

  if (type === MSG.LIST_RECORDINGS) {
    void listRecordingMeta()
      .then((list) => sendResponse({ ok: true, list }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (type === MSG.TRANSCRIBE) {
    const payload = message.payload as TranscribeOptions & { id: string };
    void (async () => {
      try {
        const blob = await getRecordingBlob(payload.id);
        if (!blob) {
          sendResponse({ ok: false, error: "Recording blob not found." });
          return;
        }
        const transcript = await transcribeRecording(blob, {
          language: payload.language,
          provider: payload.provider,
          model: payload.model,
          apiKey: payload.apiKey,
        });
        await updateRecordingTranscript(payload.id, transcript);
        sendResponse({ ok: true, transcript });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, error: msg });
      }
    })();
    return true;
  }

  if (type === MSG.DELETE_RECORDING) {
    const { id } = message.payload as { id: string };
    void removeRecording(id)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  return false;
});
