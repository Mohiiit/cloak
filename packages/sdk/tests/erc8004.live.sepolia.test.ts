import { describe, expect, it } from "vitest";
import { Account, RpcProvider } from "starknet";
import { ERC8004Client } from "../src/erc8004";

const liveEnabled = process.env.ERC8004_LIVE === "1";
const liveRpcUrl =
  process.env.ERC8004_LIVE_RPC_URL ||
  process.env.CLOAK_SEPOLIA_RPC_URL ||
  process.env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL;
const liveAccountAddress = process.env.ERC8004_LIVE_ACCOUNT_ADDRESS;
const livePrivateKey = process.env.ERC8004_LIVE_PRIVATE_KEY;
const liveEntryPoint = process.env.ERC8004_LIVE_WRITE_ENTRYPOINT;
const liveCalldataJson = process.env.ERC8004_LIVE_WRITE_CALLDATA_JSON;
const liveRegistryType = (process.env.ERC8004_LIVE_WRITE_REGISTRY ||
  "identity") as "identity" | "reputation" | "validation";
const liveRegistryAddress = process.env.ERC8004_LIVE_WRITE_REGISTRY_ADDRESS;
const liveTimeoutMs = Number(process.env.ERC8004_LIVE_TIMEOUT_MS || "300000");
const runLive =
  liveEnabled &&
  !!liveRpcUrl &&
  !!liveAccountAddress &&
  !!livePrivateKey &&
  !!liveEntryPoint &&
  !!liveCalldataJson;

const liveDescribe = runLive ? describe : describe.skip;

function parseCalldata(raw: string): Array<string | bigint | number> {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("ERC8004_LIVE_WRITE_CALLDATA_JSON must be a JSON array");
  }
  return parsed as Array<string | bigint | number>;
}

liveDescribe("erc8004 live write smoke (Sepolia)", () => {
  it(
    "submits a real write tx and waits for receipt",
    async () => {
      const provider = new RpcProvider({ nodeUrl: liveRpcUrl! });
      const account = new Account({
        provider,
        address: liveAccountAddress!,
        signer: livePrivateKey!,
        cairoVersion: "1",
      });

      const client = new ERC8004Client({
        network: "sepolia",
        provider,
        account,
        registryOverrides: liveRegistryAddress
          ? {
              [liveRegistryType]: liveRegistryAddress,
            }
          : undefined,
      });

      const tx = await client.invoke(
        liveRegistryType,
        liveEntryPoint!,
        parseCalldata(liveCalldataJson!),
      );
      expect(tx.transactionHash).toMatch(/^0x/i);

      const receipt = await client.waitForTransaction(tx.transactionHash, {
        timeoutMs: liveTimeoutMs,
        pollIntervalMs: 3000,
      });
      expect(receipt).toBeTruthy();
    },
    420_000,
  );
});
