import { afterEach, describe, expect, it, vi } from "vitest";

describe("api fetchHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns reachable when /health succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, ffmpeg: true }),
      }),
    );
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
        },
      },
    });

    const { fetchHealth } = await import("../api");
    await expect(fetchHealth()).resolves.toEqual({ reachable: true, ffmpeg: true });
  });

  it("returns unreachable when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
        },
      },
    });

    const { fetchHealth } = await import("../api");
    await expect(fetchHealth()).resolves.toEqual({ reachable: false, ffmpeg: false });
  });
});
