import { MSG } from "./lib/messages.js";
import type { MeetStatePayload } from "./lib/types.js";

function detectInMeeting(): boolean {
  const leave =
    document.querySelector('[aria-label="Leave call"]') ??
    document.querySelector('[data-tooltip="Leave call"]') ??
    Array.from(document.querySelectorAll("button")).find((b) =>
      /leave call/i.test(b.textContent?.trim() ?? ""),
    );
  return Boolean(leave);
}

function buildPayload(): MeetStatePayload {
  return {
    inMeeting: detectInMeeting(),
    url: location.href,
  };
}

function emitState(): void {
  const payload = buildPayload();
  void chrome.runtime.sendMessage({ type: MSG.MEET_STATE, payload });
}

let observer: MutationObserver | null = null;

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    emitState();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

emitState();
startObserver();

globalThis.setInterval(() => {
  emitState();
}, 5000);
