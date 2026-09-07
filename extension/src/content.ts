import { MSG } from "./lib/messages.js";
import type { MeetStatePayload } from "./lib/types.js";

const EMIT_DEBOUNCE_MS = 500;
const POLL_INTERVAL_MS = 5000;

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

let lastEmitted: string | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function emitState(force = false): void {
  const payload = buildPayload();
  const key = `${payload.inMeeting}:${payload.url}`;
  if (!force && key === lastEmitted) {
    return;
  }
  lastEmitted = key;
  void chrome.runtime.sendMessage({ type: MSG.MEET_STATE, payload });
}

function scheduleEmit(): void {
  if (debounceTimer != null) {
    return;
  }
  debounceTimer = globalThis.setTimeout(() => {
    debounceTimer = null;
    emitState();
  }, EMIT_DEBOUNCE_MS);
}

let observer: MutationObserver | null = null;

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    scheduleEmit();
  });
  // Prefer observing the main Meet UI root when available; fall back to body.
  const root =
    document.querySelector('[jscontroller][data-allocation-index]') ??
    document.querySelector("div[role='main']") ??
    document.body;
  observer.observe(root ?? document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "data-tooltip"],
  });
}

emitState(true);
startObserver();

globalThis.setInterval(() => {
  emitState(true);
}, POLL_INTERVAL_MS);
