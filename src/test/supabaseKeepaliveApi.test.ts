import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/supabase-keepalive";

describe("supabase keepalive API", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co/");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects requests without the cron authorization header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await handler.fetch(new Request("https://app.test/api/supabase-keepalive"));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the read-only Supabase RPC when authorized", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ ok: true, checked_at: "2026-05-14T10:00:00Z" })
    );

    const response = await handler.fetch(
      new Request("https://app.test/api/supabase-keepalive", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { ok: true, checked_at: "2026-05-14T10:00:00Z" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/keepalive",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: expect.objectContaining({
          "apikey": "publishable-key",
          "Authorization": "Bearer publishable-key",
        }),
      })
    );
  });
});
