import { MSG } from "../lib/messages.js";
import { getActiveMeetTabId, setText } from "./dom.js";

export async function refreshMeetState(
  meetStatus: HTMLElement,
  callStatus: HTMLElement,
): Promise<void> {
  const tabId = await getActiveMeetTabId();
  if (!tabId) {
    setText(meetStatus, "Open a Google Meet tab", "bad");
    setText(callStatus, "—", "muted");
    return;
  }
  setText(meetStatus, "Active Meet tab", "ok");
  const res = (await chrome.runtime.sendMessage({ type: MSG.GET_MEET_STATE })) as {
    ok?: boolean;
    meet?: { inMeeting: boolean; url: string } | null;
  };
  const inMeeting = Boolean(res?.meet?.inMeeting);
  setText(callStatus, inMeeting ? "Yes" : "No (join the call)", inMeeting ? "ok" : "warn");
}

export async function refreshRecordingState(
  recStatus: HTMLElement,
  btnStart: HTMLButtonElement,
  btnStop: HTMLButtonElement,
): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ type: MSG.GET_RECORDING_STATE })) as {
    ok?: boolean;
    recordingActive?: boolean;
  };
  const active = Boolean(res?.recordingActive);
  btnStart.disabled = active;
  btnStop.disabled = !active;
  setText(recStatus, active ? "Recording…" : "Idle", active ? "warn" : "muted");
}

export async function refreshServer(serverStatus: HTMLElement): Promise<void> {
  const { fetchHealth } = await import("../lib/api.js");
  const h = await fetchHealth();
  if (!h.reachable) {
    setText(serverStatus, "Offline", "bad");
    return;
  }
  if (!h.ffmpeg) {
    setText(serverStatus, "Online — ffmpeg missing (transcribe will fail)", "warn");
    return;
  }
  setText(serverStatus, "Online", "ok");
}
