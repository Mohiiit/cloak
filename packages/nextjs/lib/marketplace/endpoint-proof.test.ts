import { describe, expect, it } from "vitest";
import {
  buildEndpointOwnershipDigest,
  verifyEndpointProofSet,
} from "./endpoint-proof";

describe("endpoint ownership proof verification", () => {
  it("accepts valid proofs for all endpoints", () => {
    const digest = buildEndpointOwnershipDigest({
      endpoint: "https://agents.cloak.local/staking",
      operatorWallet: "0xabc123",
      nonce: "nonce_1",
    });

    const check = verifyEndpointProofSet({
      operatorWallet: "0xabc123",
      endpoints: ["https://agents.cloak.local/staking"],
      proofs: [
        {
          endpoint: "https://agents.cloak.local/staking",
          nonce: "nonce_1",
          digest,
        },
      ],
    });

    expect(check.ok).toBe(true);
  });

  it("rejects invalid proof digest", () => {
    const check = verifyEndpointProofSet({
      operatorWallet: "0xabc123",
      endpoints: ["https://agents.cloak.local/staking"],
      proofs: [
        {
          endpoint: "https://agents.cloak.local/staking",
          nonce: "nonce_1",
          digest:
            "0000000000000000000000000000000000000000000000000000000000000000",
        },
      ],
    });

    expect(check.ok).toBe(false);
    expect(check.reason).toContain("Invalid endpoint digest");
  });
});

