import { describe, expect, it, vi } from "vitest";
import {
  ERC8004Client,
  ERC8004WriteNotConfiguredError,
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
    expect(provider.callContract).toHaveBeenCalledWith({
      contractAddress: ERC8004_REGISTRIES.sepolia.identity,
      entrypoint: "owner_of",
      calldata: ["0x7", "0x0"],
    });
  });

  it("falls back to felt calldata when uint256 calldata is not accepted", async () => {
    const provider = {
      callContract: vi
        .fn()
        .mockRejectedValueOnce(new Error("Failed to deserialize param #1"))
        .mockResolvedValueOnce(["0xabc"]),
    } as any;
    const client = new ERC8004Client({ network: "sepolia", provider });
    await expect(client.ownerOf(9)).resolves.toBe("0xabc");
    expect(provider.callContract).toHaveBeenNthCalledWith(1, {
      contractAddress: ERC8004_REGISTRIES.sepolia.identity,
      entrypoint: "owner_of",
      calldata: ["0x9", "0x0"],
    });
    expect(provider.callContract).toHaveBeenNthCalledWith(2, {
      contractAddress: ERC8004_REGISTRIES.sepolia.identity,
      entrypoint: "owner_of",
      calldata: ["0x9"],
    });
  });

  it("returns null from wrappers on provider failure", async () => {
    const provider = { callContract: vi.fn().mockRejectedValue(new Error("boom")) } as any;
    const client = new ERC8004Client({ network: "sepolia", provider });
    await expect(client.ownerOf(7)).resolves.toBeNull();
    await expect(client.tokenUri(7)).resolves.toBeNull();
    await expect(client.getSummary("reputation", 7)).resolves.toBeNull();
  });

  it("invokes registry entrypoints through account executor", async () => {
    const provider = { callContract: vi.fn() } as any;
    const account = {
      execute: vi.fn().mockResolvedValue({
        transaction_hash: "0x1234",
      }),
    };
    const client = new ERC8004Client({
      network: "sepolia",
      provider,
      account,
    });

    const tx = await client.registerAgentOnchain({
      entrypoint: "register_agent",
      calldata: [1, "0xabc"],
    });
    expect(tx.transactionHash).toBe("0x1234");
    expect(account.execute).toHaveBeenCalledWith(
      [
        {
          contractAddress: ERC8004_REGISTRIES.sepolia.identity,
          entrypoint: "register_agent",
          calldata: ["0x1", "0xabc"],
        },
      ],
      undefined,
    );
  });

  it("throws when write path is used without account executor", async () => {
    const client = new ERC8004Client({
      network: "sepolia",
      provider: { callContract: vi.fn() } as any,
    });
    await expect(
      client.invoke("identity", "register_agent", [1]),
    ).rejects.toBeInstanceOf(ERC8004WriteNotConfiguredError);
  });

  it("waits for transaction via provider waitForTransaction", async () => {
    const provider = {
      callContract: vi.fn(),
      waitForTransaction: vi.fn().mockResolvedValue({
        finality_status: "ACCEPTED_ON_L2",
      }),
    };
    const client = new ERC8004Client({
      network: "sepolia",
      provider: provider as any,
    });

    await expect(client.waitForTransaction("0xabc")).resolves.toEqual({
      finality_status: "ACCEPTED_ON_L2",
    });
    expect(provider.waitForTransaction).toHaveBeenCalledWith(
      "0xabc",
      expect.objectContaining({
        retryInterval: 4000,
        timeout: 180000,
      }),
    );
  });
});
