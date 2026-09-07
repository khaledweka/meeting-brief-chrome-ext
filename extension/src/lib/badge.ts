/** Update the extension action badge to reflect recording state. */
export async function setRecordingBadge(active: boolean): Promise<void> {
  try {
    if (active) {
      await chrome.action.setBadgeText({ text: "REC" });
      await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
      await chrome.action.setTitle({ title: "MeetBrief Local — Recording" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.action.setTitle({ title: "MeetBrief Local" });
    }
  } catch (e) {
    console.warn("[MeetingBrief] Failed to update badge:", e);
  }
}
