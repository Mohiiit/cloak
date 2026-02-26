// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

vi.mock("../_lib/push/config", () => ({
  getPushDispatchConfig: vi.fn(),
}));

import { getSupabase } from "../_lib/supabase";
import { getPushDispatchConfig } from "../_lib/push/config";

describe("dispatchWardApprovalPushEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits when dispatch is disabled", async () => {
    (getPushDispatchConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      enabled: false,
      shadowMode: false,
      batchSize: 25,
      leaseSeconds: 45,
      maxAttempts: 5,
      baseRetryMs: 5000,
      maxRetryMs: 300000,
      dispatchSecret: "secret",
      tokenProvider: "none",
      tokenProviderUrl: null,
      tokenProviderAuthHeader: null,
      expoAccessToken: null,
      vapidPublicKey: null,
      vapidPrivateKey: null,
      vapidSubject: null,
    });

    const { dispatchWardApprovalPushEvents } = await import(
      "../_lib/push/dispatcher"
    );
    const result = await dispatchWardApprovalPushEvents();
    expect(result.enabled).toBe(false);
    expect(result.claimed).toBe(0);
    expect(getSupabase).not.toHaveBeenCalled();
  });
});

