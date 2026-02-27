import { describe, it, expect, beforeEach } from "vitest";
import {
  createDelegation,
  getDelegation,
  listDelegations,
  revokeDelegation,
  consumeDelegation,
  validateDelegationForRun,
  clearDelegations,
} from "./delegation-registry";
import type { CreateDelegationRequest } from "@cloak-wallet/sdk";

const OPERATOR = "0xOperator1";
const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const past = (ms: number) => new Date(Date.now() - ms).toISOString();

function baseDelegation(
  overrides: Partial<CreateDelegationRequest> = {},
): CreateDelegationRequest {
  return {
    agent_id: "agent-staker",
    agent_type: "staking_steward",
    allowed_actions: ["stake", "unstake"],
    token: "STRK",
    max_per_run: "1000",
    total_allowance: "5000",
    valid_from: past(60_000),
    valid_until: future(3_600_000),
    ...overrides,
  };
}

describe("delegation-registry", () => {
  beforeEach(() => clearDelegations());

  describe("CRUD", () => {
    it("creates and retrieves a delegation", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      expect(d.id).toMatch(/^dlg_/);
      expect(d.operator_wallet).toBe(OPERATOR);
      expect(d.status).toBe("active");
      expect(d.consumed_amount).toBe("0");
      expect(d.remaining_allowance).toBe("5000");
      expect(d.nonce).toBe(0);

      const fetched = getDelegation(d.id);
      expect(fetched).toEqual(d);
    });

    it("lists delegations filtered by operator", () => {
      createDelegation(OPERATOR, baseDelegation());
      createDelegation("0xOther", baseDelegation());

      const list = listDelegations(OPERATOR);
      expect(list).toHaveLength(1);
      expect(list[0].operator_wallet).toBe(OPERATOR);
    });

    it("lists delegations filtered by agent_id", () => {
      createDelegation(OPERATOR, baseDelegation({ agent_id: "a1" }));
      createDelegation(OPERATOR, baseDelegation({ agent_id: "a2" }));

      const list = listDelegations(OPERATOR, "a1");
      expect(list).toHaveLength(1);
      expect(list[0].agent_id).toBe("a1");
    });

    it("revokes a delegation", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      const revoked = revokeDelegation(d.id, OPERATOR);
      expect(revoked?.status).toBe("revoked");
      expect(revoked?.revoked_at).toBeTruthy();
    });

    it("revoke returns null for wrong operator", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      expect(revokeDelegation(d.id, "0xWrong")).toBeNull();
    });

    it("revoke is idempotent", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      revokeDelegation(d.id, OPERATOR);
      const again = revokeDelegation(d.id, OPERATOR);
      expect(again?.status).toBe("revoked");
    });
  });

  describe("consumeDelegation", () => {
    it("consumes amount and updates nonce", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      const result = consumeDelegation(d.id, "500");
      expect(result.ok).toBe(true);
      expect(result.remaining).toBe("4500");

      const updated = getDelegation(d.id)!;
      expect(updated.consumed_amount).toBe("500");
      expect(updated.nonce).toBe(1);
    });

    it("rejects when exceeds max_per_run", () => {
      const d = createDelegation(OPERATOR, baseDelegation({ max_per_run: "100" }));
      const result = consumeDelegation(d.id, "200");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("exceeds_max_per_run");
    });

    it("rejects when exceeds total_allowance", () => {
      const d = createDelegation(
        OPERATOR,
        baseDelegation({ total_allowance: "100", max_per_run: "200" }),
      );
      const result = consumeDelegation(d.id, "150");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("insufficient_allowance");
    });

    it("rejects when delegation is revoked", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      revokeDelegation(d.id, OPERATOR);
      const result = consumeDelegation(d.id, "100");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("delegation_revoked");
    });

    it("rejects when delegation is expired", () => {
      const d = createDelegation(
        OPERATOR,
        baseDelegation({ valid_until: past(1000) }),
      );
      const result = consumeDelegation(d.id, "100");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("delegation_expired");
    });

    it("tracks multiple consumes", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      consumeDelegation(d.id, "1000");
      consumeDelegation(d.id, "1000");
      consumeDelegation(d.id, "1000");
      const result = consumeDelegation(d.id, "1000");
      expect(result.ok).toBe(true);
      expect(result.remaining).toBe("1000");

      const updated = getDelegation(d.id)!;
      expect(updated.nonce).toBe(4);
    });
  });

  describe("validateDelegationForRun", () => {
    it("validates a valid run", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      const result = validateDelegationForRun(d.id, "stake", "500", "STRK");
      expect(result.valid).toBe(true);
    });

    it("rejects unknown action", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      const result = validateDelegationForRun(d.id, "swap", "500", "STRK");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("action_not_allowed");
    });

    it("rejects wrong token", () => {
      const d = createDelegation(OPERATOR, baseDelegation());
      const result = validateDelegationForRun(d.id, "stake", "500", "ETH");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("token_mismatch");
    });

    it("rejects not-yet-active delegation", () => {
      const d = createDelegation(
        OPERATOR,
        baseDelegation({ valid_from: future(60_000) }),
      );
      const result = validateDelegationForRun(d.id, "stake", "500", "STRK");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("delegation_not_yet_active");
    });
  });
});
