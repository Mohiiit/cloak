import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigator = {
  getAddressFromStarkName: vi.fn(),
  getStarkName: vi.fn(),
  getStarkNames: vi.fn(),
  getProfileData: vi.fn(),
  getStarkProfiles: vi.fn(),
};

vi.mock("starknetid.js", () => ({
  StarknetIdNavigator: vi.fn(() => mockNavigator),
}));

const { StarknetIdClient, normalizeStarkName, isStarkName } = await import(
  "../src/starknet-id"
);

describe("starknet-id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes .stark names", () => {
    expect(normalizeStarkName("alice")).toBe("alice.stark");
    expect(normalizeStarkName("ALICE.STARK")).toBe("alice.stark");
  });

  it("validates stark names", () => {
    expect(isStarkName("alice.stark")).toBe(true);
    expect(isStarkName("alice")).toBe(false);
  });

  it("resolves address from stark name", async () => {
    mockNavigator.getAddressFromStarkName.mockResolvedValue("0x1234");
    const client = new StarknetIdClient({ network: "sepolia" });
    const addr = await client.resolveAddress("alice");
    expect(addr).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000001234",
    );
  });

  it("returns null if name resolution fails", async () => {
    mockNavigator.getAddressFromStarkName.mockRejectedValue(new Error("not found"));
    const client = new StarknetIdClient({ network: "sepolia" });
    await expect(client.resolveAddress("missing")).resolves.toBeNull();
  });

  it("resolves stark name from address", async () => {
    mockNavigator.getStarkName.mockResolvedValue("alice.stark");
    const client = new StarknetIdClient({ network: "sepolia" });
    const name = await client.resolveName("0x123");
    expect(name).toBe("alice.stark");
  });

  it("batch resolves names", async () => {
    mockNavigator.getStarkNames.mockResolvedValue(["alice.stark", "bob.stark"]);
    const client = new StarknetIdClient({ network: "sepolia" });
    const map = await client.resolveNames(["0x1", "0x2"]);
    expect(map["0x1"]).toBe("alice.stark");
    expect(map["0x2"]).toBe("bob.stark");
  });

  it("reads profile data", async () => {
    mockNavigator.getProfileData.mockResolvedValue({
      name: "alice.stark",
      profilePicture: "https://img",
      twitter: "alice",
    });
    const client = new StarknetIdClient({ network: "sepolia" });
    const profile = await client.getProfile("0x1");
    expect(profile).toEqual({
      name: "alice.stark",
      profilePicture: "https://img",
      twitter: "alice",
      github: undefined,
      discord: undefined,
      proofOfPersonhood: undefined,
    });
  });
});
