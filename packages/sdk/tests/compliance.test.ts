import { describe, expect, it, vi } from "vitest";
import {
  grantViewingAccess,
  listInnocenceProofs,
  listViewingGrantsForOwner,
  listViewingGrantsForViewer,
  revokeViewingAccess,
  submitInnocenceProof,
} from "../src/compliance";

function createMockSupabase() {
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  };
}

describe("compliance", () => {
  it("grants viewing access with normalized addresses", async () => {
    const sb = createMockSupabase();
    sb.insert.mockResolvedValue([
      {
        id: "1",
        owner_address: "0xab",
        viewer_address: "0xcd",
        encrypted_viewing_key: "enc",
        scope: "transactions",
        status: "active",
      },
    ]);

    const row = await grantViewingAccess(sb as any, {
      owner_address: "0x000Ab",
      viewer_address: "0x000Cd",
      encrypted_viewing_key: "enc",
      scope: "transactions",
    });

    expect(sb.insert).toHaveBeenCalledWith("viewing_key_grants", {
      owner_address: "0xab",
      viewer_address: "0xcd",
      encrypted_viewing_key: "enc",
      scope: "transactions",
      status: "active",
    });
    expect(row.id).toBe("1");
  });

  it("revokes grant by id", async () => {
    const sb = createMockSupabase();
    sb.update.mockResolvedValue([{ id: "grant-1", status: "revoked" }]);

    const row = await revokeViewingAccess(sb as any, "grant-1", "expired");
    expect(sb.update).toHaveBeenCalled();
    expect(row?.status).toBe("revoked");
  });

  it("lists grants for owner and viewer", async () => {
    const sb = createMockSupabase();
    sb.select.mockResolvedValue([]);

    await listViewingGrantsForOwner(sb as any, "0x00Aa");
    await listViewingGrantsForViewer(sb as any, "0x00Bb");

    expect(sb.select).toHaveBeenNthCalledWith(
      1,
      "viewing_key_grants",
      "owner_address=eq.0xaa&status=eq.active",
      "created_at.desc",
    );
    expect(sb.select).toHaveBeenNthCalledWith(
      2,
      "viewing_key_grants",
      "viewer_address=eq.0xbb&status=eq.active",
      "created_at.desc",
    );
  });

  it("submits and lists innocence proofs", async () => {
    const sb = createMockSupabase();
    sb.insert.mockResolvedValue([
      {
        id: "p1",
        owner_address: "0xaa",
        proof_hash: "0xproof",
        circuit_version: "v1",
      },
    ]);
    sb.select.mockResolvedValue([{ id: "p1" }]);

    const created = await submitInnocenceProof(sb as any, {
      owner_address: "0x00Aa",
      proof_hash: "0xproof",
      circuit_version: "v1",
    });
    const listed = await listInnocenceProofs(sb as any, "0x00Aa");

    expect(created.id).toBe("p1");
    expect(listed.length).toBe(1);
  });
});
