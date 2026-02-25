import { describe, expect, it } from "vitest";
import {
  buildEndpointOwnershipDigest,
  createEndpointOwnershipProof,
} from "../src/marketplace-proof";

describe("marketplace endpoint proof helpers", () => {
  it("builds deterministic digest for endpoint ownership", () => {
    const digestA = buildEndpointOwnershipDigest({
      endpoint: "https://agents.cloak.local/staking/",
      operatorWallet: "0xABC123",
      nonce: "nonce_1",
    });
    const digestB = buildEndpointOwnershipDigest({
      endpoint: "https://agents.cloak.local/staking",
      operatorWallet: "0xabc123",
      nonce: "nonce_1",
    });
    expect(digestA).toBe(digestB);
    expect(digestA).toHaveLength(64);
  });

  it("creates endpoint proof payload", () => {
    const proof = createEndpointOwnershipProof({
      endpoint: "https://agents.cloak.local/swap",
      operatorWallet: "0xabc123",
      nonce: "nonce_2",
    });
    expect(proof.endpoint).toBe("https://agents.cloak.local/swap");
    expect(proof.digest).toHaveLength(64);
  });
});

