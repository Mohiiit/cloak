import { describe, it, expect, beforeEach } from "vitest";
import {
  validateSpendAuthorization,
  consumeSpendAuthorization,
  buildSpendAuthorizationEvidence,
  clearSpendAuthorizationState,
} from "./spend-authorization";
import {
  createDelegation,
  clearDelegations,
} from "./delegation-registry";
import type { SpendAuthorization } from "@cloak-wallet/sdk";

const OPERATOR = "0xOperator1";
const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const past = (ms: number) => new Date(Date.now() - ms).toISOString();

function setup() {
  const d = createDelegation(OPERATOR, {
    agent_id: "agent-staker",
    agent_type: "staking_steward",
    allowed_actions: ["stake", "unstake"],
    token: "STRK",
    max_per_run: "1000",
    total_allowance: "5000",
    valid_from: past(60_000),
    valid_until: future(3_600_000),
  });
  return d;
}

function baseAuth(
  delegationId: string,
  overrides: Partial<SpendAuthorization> = {},
): SpendAuthorization {
  return {
    delegation_id: delegationId,
    run_id: "run_abc",
    agent_id: "agent-staker",
    action: "stake",
    amount: "500",
    token: "STRK",
    expires_at: future(300_000),
    nonce: `${Date.now()}-${Math.random()}`,
    ...overrides,
  };
}

describe("spend-authorization", () => {
  beforeEach(() => {
    clearDelegations();
    clearSpendAuthorizationState();
  });

  describe("validateSpendAuthorization", () => {
    it("validates a correct authorization", async () => {
      const d = setup();
      const result = await validateSpendAuthorization(baseAuth(d.id));
      expect(result.valid).toBe(true);
    });

    it("rejects missing fields", async () => {
      const result = await validateSpendAuthorization({
        delegation_id: "",
        run_id: "",
        agent_id: "",
        action: "stake",
        amount: "500",
        token: "STRK",
        expires_at: future(300_000),
        nonce: "1",
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("missing_required_fields");
    });

    it("rejects expired auth", async () => {
      const d = setup();
      const result = await validateSpendAuthorization(
        baseAuth(d.id, { expires_at: past(1000) }),
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("spend_auth_expired");
    });

    it("rejects agent_id mismatch", async () => {
      const d = setup();
      const result = await validateSpendAuthorization(
        baseAuth(d.id, { agent_id: "wrong-agent" }),
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("agent_id_mismatch");
    });

    it("rejects invalid amount", async () => {
      const d = setup();
      const result = await validateSpendAuthorization(
        baseAuth(d.id, { amount: "0" }),
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_amount");
    });
  });

  describe("consumeSpendAuthorization", () => {
    it("consumes and returns evidence (off-chain path)", async () => {
      const d = setup();
      const auth = baseAuth(d.id);
      const evidence = await consumeSpendAuthorization(auth);
      expect(evidence.delegation_id).toBe(d.id);
      expect(evidence.authorized_amount).toBe("500");
      expect(evidence.consumed_amount).toBe("500");
      expect(evidence.remaining_allowance_snapshot).toBe("4500");
      expect(evidence.delegation_consume_tx_hash).toBeNull();
      expect(evidence.escrow_transfer_tx_hash).toBeNull();
    });

    it("rejects nonce replay", async () => {
      const d = setup();
      const auth = baseAuth(d.id);
      await consumeSpendAuthorization(auth);
      await expect(consumeSpendAuthorization(auth)).rejects.toThrow("nonce_replay");
    });

    it("rejects invalid authorization", async () => {
      const d = setup();
      const auth = baseAuth(d.id, { amount: "9999" }); // exceeds max_per_run
      await expect(consumeSpendAuthorization(auth)).rejects.toThrow(
        "exceeds_max_per_run",
      );
    });
  });

  describe("consumeSpendAuthorization with on-chain env", () => {
    it("falls back to off-chain when ERC8004_DELEGATION_MANAGER_ADDRESS is 0x0", async () => {
      process.env.ERC8004_DELEGATION_MANAGER_ADDRESS = "0x0";
      const d = setup();
      const auth = baseAuth(d.id);
      const evidence = await consumeSpendAuthorization(auth, "0xSignerAddress");
      expect(evidence.delegation_consume_tx_hash).toBeNull();
      expect(evidence.escrow_transfer_tx_hash).toBeNull();
      delete process.env.ERC8004_DELEGATION_MANAGER_ADDRESS;
    });

    it("falls back to off-chain when no recipient provided", async () => {
      process.env.ERC8004_DELEGATION_MANAGER_ADDRESS = "0x123abc";
      const d = setup();
      const auth = baseAuth(d.id);
      const evidence = await consumeSpendAuthorization(auth);
      expect(evidence.delegation_consume_tx_hash).toBeNull();
      expect(evidence.escrow_transfer_tx_hash).toBeNull();
      delete process.env.ERC8004_DELEGATION_MANAGER_ADDRESS;
    });
  });

  describe("buildSpendAuthorizationEvidence", () => {
    it("builds evidence from delegation state", async () => {
      const d = setup();
      const evidence = await buildSpendAuthorizationEvidence(d.id, "300");
      expect(evidence.delegation_id).toBe(d.id);
      expect(evidence.authorized_amount).toBe("300");
      expect(evidence.consumed_amount).toBe("0");
      expect(evidence.remaining_allowance_snapshot).toBe("5000");
      expect(evidence.escrow_transfer_tx_hash).toBeNull();
    });

    it("throws for missing delegation", async () => {
      await expect(buildSpendAuthorizationEvidence("missing", "100")).rejects.toThrow(
        "not found",
      );
    });
  });
});
