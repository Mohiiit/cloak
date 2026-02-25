import { describe, expect, it } from "vitest";
import {
  clearHires,
  createHire,
  getHire,
  listHires,
  updateHireStatus,
} from "./hires-store";

describe("hires store", () => {
  it("creates, lists and updates hires", () => {
    clearHires();

    const hire = createHire({
      agent_id: "agent_a",
      operator_wallet: "0xabc123",
      policy_snapshot: { cap: 1000 },
      billing_mode: "per_run",
    });

    expect(hire.status).toBe("active");
    expect(getHire(hire.id)?.id).toBe(hire.id);
    expect(listHires({ operatorWallet: "0xabc123" })).toHaveLength(1);

    const paused = updateHireStatus(hire.id, "paused");
    expect(paused?.status).toBe("paused");
  });
});

