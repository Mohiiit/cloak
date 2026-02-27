import { describe, expect, it, vi } from "vitest";
import {
  checkAgentOnchainIdentity,
  isOnchainIdentityEnforced,
} from "./onchain-identity";

function env(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("on-chain identity checks", () => {
  it("skips lookup when enforcement is disabled", async () => {
    const client = { ownerOf: vi.fn() };
    const check = await checkAgentOnchainIdentity(
      {
        agentId: "1",
        operatorWallet: "0xabc",
      },
      {
        env: env({
          MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY: "false",
        }),
        client,
      },
    );

    expect(check.status).toBe("skipped");
    expect(client.ownerOf).not.toHaveBeenCalled();
  });

  it("returns verified when owner matches operator", async () => {
    const check = await checkAgentOnchainIdentity(
      {
        agentId: "1",
        operatorWallet: "0xabc",
      },
      {
        env: env({
          MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY: "true",
        }),
        client: {
          ownerOf: vi.fn().mockResolvedValue("0x000abc"),
        },
      },
    );

    expect(check.enforced).toBe(true);
    expect(check.verified).toBe(true);
    expect(check.status).toBe("verified");
  });

  it("returns mismatch when owner differs", async () => {
    const check = await checkAgentOnchainIdentity(
      {
        agentId: "1",
        operatorWallet: "0xabc",
      },
      {
        env: env({
          MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY: "true",
        }),
        client: {
          ownerOf: vi.fn().mockResolvedValue("0xdef"),
        },
      },
    );

    expect(check.enforced).toBe(true);
    expect(check.verified).toBe(false);
    expect(check.status).toBe("mismatch");
    expect(check.reason).toBe("operator_owner_mismatch");
  });

  it("parses enforcement flag", () => {
    expect(
      isOnchainIdentityEnforced(
        env({ MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY: "1" }),
      ),
    ).toBe(true);
    expect(
      isOnchainIdentityEnforced(
        env({ MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY: "true\\n" }),
      ),
    ).toBe(true);
    expect(
      isOnchainIdentityEnforced(
        env({ MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY: "false" }),
      ),
    ).toBe(false);
    expect(isOnchainIdentityEnforced(env({}))).toBe(false);
  });
});
