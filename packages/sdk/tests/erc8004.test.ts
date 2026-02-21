import { describe, expect, it, vi } from "vitest";
import {
  ERC8004Client,
  ERC8004_REGISTRIES,
  getERC8004RegistryAddress,
  getERC8004Registries,
} from "../src/erc8004";

describe("erc8004", () => {
  it("exposes registry address map", () => {
    expect(getERC8004Registries("sepolia")).toEqual(ERC8004_REGISTRIES.sepolia);
    expect(getERC8004RegistryAddress("mainnet", "identity")).toBe(
      ERC8004_REGISTRIES.mainnet.identity,
    );
  });

  it("calls registry entrypoints via provider", async () => {
    const callContract = vi.fn().mockResolvedValue(["0xabc"]);
    const provider = { callContract } as any;
    const client = new ERC8004Client({ network: "sepolia", provider });

    const result = await client.call("identity", "owner_of", [1, "0x2"]);
    expect(result).toEqual(["0xabc"]);
    expect(callContract).toHaveBeenCalledWith({
      contractAddress: ERC8004_REGISTRIES.sepolia.identity,
      entrypoint: "owner_of",
      calldata: ["0x1", "0x2"],
    });
  });

  it("provides ownerOf convenience wrapper", async () => {
    const provider = { callContract: vi.fn().mockResolvedValue(["0x999"]) } as any;
    const client = new ERC8004Client({ network: "sepolia", provider });
    await expect(client.ownerOf(7)).resolves.toBe("0x999");
  });

  it("returns null from wrappers on provider failure", async () => {
    const provider = { callContract: vi.fn().mockRejectedValue(new Error("boom")) } as any;
    const client = new ERC8004Client({ network: "sepolia", provider });
    await expect(client.ownerOf(7)).resolves.toBeNull();
    await expect(client.tokenUri(7)).resolves.toBeNull();
    await expect(client.getSummary("reputation", 7)).resolves.toBeNull();
  });
});
