import { describe, expect, it } from "vitest";
import { executeWithBasicProtocols } from "./basic-protocol-adapter";

const liveEnabled = process.env.BASIC_PROTOCOL_LIVE === "1";
const liveMode = (process.env.BASIC_PROTOCOL_LIVE_MODE || "custom_calls")
  .trim()
  .toLowerCase();
const liveRpcUrl =
  process.env.CLOAK_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL;
const liveSignerAddress =
  process.env.BASIC_PROTOCOL_SIGNER_ADDRESS || process.env.ERC8004_SIGNER_ADDRESS;
const liveSignerPrivateKey =
  process.env.BASIC_PROTOCOL_SIGNER_PRIVATE_KEY || process.env.ERC8004_SIGNER_PRIVATE_KEY;
const liveSignerSecondaryPrivateKey =
  process.env.BASIC_PROTOCOL_SIGNER_SECONDARY_PRIVATE_KEY ||
  process.env.ERC8004_SIGNER_SECONDARY_PRIVATE_KEY;
const liveCallsJson = process.env.BASIC_PROTOCOL_LIVE_CALLS_JSON;
const liveStakeAmount = process.env.BASIC_PROTOCOL_LIVE_STAKE_AMOUNT || "1";
const liveStakeAmountUnit =
  process.env.BASIC_PROTOCOL_LIVE_STAKE_AMOUNT_UNIT || "strk";
const requiresCallsJson = liveMode !== "stake";
const runLive =
  liveEnabled &&
  !!liveRpcUrl &&
  !!liveSignerAddress &&
  !!liveSignerPrivateKey &&
  (requiresCallsJson ? !!liveCallsJson : true);
const liveDescribe = runLive ? describe : describe.skip;

function parseCalls(raw: string): Array<{
  contractAddress: string;
  entrypoint: string;
  calldata?: string[];
}> {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("BASIC_PROTOCOL_LIVE_CALLS_JSON must be a non-empty JSON array");
  }
  return parsed as Array<{
    contractAddress: string;
    entrypoint: string;
    calldata?: string[];
  }>;
}

liveDescribe("basic protocol live smoke (Sepolia)", () => {
  it(
    "submits a real execute() bundle and returns tx hash",
    async () => {
      const input =
        liveMode === "stake"
          ? {
              agentType: "staking_steward" as const,
              action: "stake",
              params: {
                amount: liveStakeAmount,
                amount_unit: liveStakeAmountUnit,
                token: "STRK",
                staking_contract: process.env.BASIC_PROTOCOL_STAKING_CONTRACT,
              },
              operatorWallet: liveSignerAddress!,
              serviceWallet: liveSignerAddress!,
              protocol: "basic-live-stake",
            }
          : {
              agentType: "treasury_dispatcher" as const,
              action: "dispatch_batch",
              params: {
                calls: parseCalls(liveCallsJson!),
              },
              operatorWallet: liveSignerAddress!,
              serviceWallet: liveSignerAddress!,
              protocol: "basic-live-smoke",
            };
      const result = await executeWithBasicProtocols(
        input,
        {
          ...process.env,
          BASIC_PROTOCOL_SIGNER_ADDRESS: liveSignerAddress!,
          BASIC_PROTOCOL_SIGNER_PRIVATE_KEY: liveSignerPrivateKey!,
          ...(liveSignerSecondaryPrivateKey
            ? {
                BASIC_PROTOCOL_SIGNER_SECONDARY_PRIVATE_KEY:
                  liveSignerSecondaryPrivateKey,
              }
            : {}),
          CLOAK_SEPOLIA_RPC_URL: liveRpcUrl!,
          NODE_ENV: process.env.NODE_ENV ?? "test",
        },
      );

      expect(result.provider).toBe("basic-protocol");
      expect(result.txHashes[0]).toMatch(/^0x/i);
    },
    420_000,
  );
});
