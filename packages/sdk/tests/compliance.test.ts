import { describe, expect, it, vi } from "vitest";
import {
  grantViewingAccess,
  listInnocenceProofs,
  listViewingGrantsForOwner,
  listViewingGrantsForViewer,
  revokeViewingAccess,
  submitInnocenceProof,
} from "../src/compliance";

function createMockClient() {
  return {
    createViewingGrant: vi.fn(),
    revokeViewingGrant: vi.fn(),
    listViewingGrants: vi.fn(),
    submitInnocenceProof: vi.fn(),
    listInnocenceProofs: vi.fn(),
  };
}

describe("compliance", () => {
  it("grants viewing access with normalized addresses", async () => {
    const client = createMockClient();
    client.createViewingGrant.mockResolvedValue({
      id: "1",
      owner_address: "0xab",
      viewer_address: "0xcd",
      encrypted_viewing_key: "enc",
      scope: "transactions",
      status: "active",
      expires_at: null,
      created_at: "2026-01-01",
      revoked_at: null,
      revocation_reason: null,
    });

    const row = await grantViewingAccess(client as any, {
      owner_address: "0x000Ab",
      viewer_address: "0x000Cd",
      encrypted_viewing_key: "enc",
      scope: "transactions",
    });

    expect(client.createViewingGrant).toHaveBeenCalledWith({
      viewer_address: "0xcd",
      encrypted_viewing_key: "enc",
      scope: "transactions",
      expires_at: null,
    });
    expect(row.id).toBe("1");
  });

  it("revokes grant by id", async () => {
    const client = createMockClient();
    client.revokeViewingGrant.mockResolvedValue(undefined);

    const row = await revokeViewingAccess(client as any, "grant-1", "expired");
    expect(client.revokeViewingGrant).toHaveBeenCalledWith("grant-1", "expired");
    expect(row).toBeNull();
  });

  it("lists grants for owner and viewer", async () => {
    const client = createMockClient();
    client.listViewingGrants.mockResolvedValue([]);

    await listViewingGrantsForOwner(client as any, "0x00Aa");
    await listViewingGrantsForViewer(client as any, "0x00Bb");

    expect(client.listViewingGrants).toHaveBeenNthCalledWith(1, {
      role: "owner",
      include_revoked: false,
    });
    expect(client.listViewingGrants).toHaveBeenNthCalledWith(2, {
      role: "viewer",
      include_revoked: false,
    });
  });

  it("submits and lists innocence proofs", async () => {
    const client = createMockClient();
    client.submitInnocenceProof.mockResolvedValue({
      id: "p1",
      owner_address: "0xaa",
      proof_hash: "0xproof",
      circuit_version: "v1",
      nullifier_hash: null,
      note: null,
      created_at: "2026-01-01",
    });
    client.listInnocenceProofs.mockResolvedValue([
      {
        id: "p1",
        owner_address: "0xaa",
        proof_hash: "0xproof",
        circuit_version: "v1",
        nullifier_hash: null,
        note: null,
        created_at: "2026-01-01",
      },
    ]);

    const created = await submitInnocenceProof(client as any, {
      owner_address: "0x00Aa",
      proof_hash: "0xproof",
      circuit_version: "v1",
    });
    const listed = await listInnocenceProofs(client as any, "0x00Aa");

    expect(created.id).toBe("p1");
    expect(listed.length).toBe(1);
  });
});
