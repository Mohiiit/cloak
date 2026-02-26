// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPushDispatchConfig } from "../_lib/push/config";

describe("push dispatch config", () => {
  it("uses safe defaults", () => {
    const cfg = getPushDispatchConfig({});
    expect(cfg.enabled).toBe(true);
    expect(cfg.shadowMode).toBe(false);
    expect(cfg.batchSize).toBe(25);
    expect(cfg.tokenProvider).toBe("none");
  });

  it("parses env overrides", () => {
    const cfg = getPushDispatchConfig({
      PUSH_DISPATCH_ENABLED: "false",
      PUSH_DISPATCH_SHADOW_MODE: "true",
      PUSH_DISPATCH_BATCH_SIZE: "120",
      PUSH_DISPATCH_MAX_ATTEMPTS: "3",
      PUSH_TOKEN_PROVIDER: "expo",
      PUSH_EXPO_ACCESS_TOKEN: "expo-secret",
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.shadowMode).toBe(true);
    expect(cfg.batchSize).toBe(120);
    expect(cfg.maxAttempts).toBe(3);
    expect(cfg.tokenProvider).toBe("expo");
    expect(cfg.expoAccessToken).toBe("expo-secret");
  });
});

