import { describe, it, expect, vi } from "vitest";
import { fetchWardPolicySnapshot } from "../src/router";

describe("fetchWardPolicySnapshot", () => {
  it("returns null for non-ward accounts", async () => {
    const provider = {
      callContract: vi.fn().mockResolvedValueOnce(["0x1234"]),
    } as any;

    const snapshot = await fetchWardPolicySnapshot(provider, "0xabc");
    expect(snapshot).toBeNull();
  });

  it("reads ward policy fields from chain", async () => {
    const provider = {
      callContract: vi.fn(async ({ entrypoint }: { entrypoint: string }) => {
        switch (entrypoint) {
          case "get_account_type":
            return ["0x57415244"];
          case "get_guardian_address":
            return ["0x00000000000009"];
          case "is_2fa_enabled":
            return ["0x1"];
          case "is_guardian_2fa_enabled":
            return ["0x0"];
          case "is_require_guardian_for_all":
            return ["0x1"];
          case "get_spending_limit_per_tx":
            return ["0x64"];
          case "get_spending_limit_24h":
            return ["0xc8"];
          case "get_spent_24h":
            return ["0x32"];
          default:
            throw new Error(`unexpected entrypoint: ${entrypoint}`);
        }
      }),
    } as any;

    const snapshot = await fetchWardPolicySnapshot(provider, "0x000123");
    expect(snapshot).toEqual({
      wardAddress: "0x123",
      guardianAddress: "0x9",
      wardHas2fa: true,
      guardianHas2fa: false,
      requireGuardianForAll: true,
      maxPerTxn: 100n,
      dailyLimit24h: 200n,
      spent24h: 50n,
    });
  });
});
