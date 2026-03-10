import type { RpcProvider } from "starknet";
import type { WardPolicySnapshot } from "./policy";

const WARD_ACCOUNT_TYPE = "0x57415244"; // "WARD"

function normalizeAddress(addr: string): string {
  const lower = addr.toLowerCase();
  if (!lower.startsWith("0x")) return lower;
  const stripped = lower.slice(2).replace(/^0+/, "");
  return `0x${stripped || "0"}`;
}

function feltToBigInt(value: string | undefined): bigint {
  if (!value) return 0n;
  return BigInt(value);
}

async function safeCall(
  provider: RpcProvider,
  wardAddress: string,
  entrypoint: string,
): Promise<string[]> {
  try {
    return await provider.callContract({
      contractAddress: wardAddress,
      entrypoint,
      calldata: [],
    });
  } catch {
    return ["0x0"];
  }
}

export async function fetchWardPolicySnapshot(
  provider: RpcProvider,
  wardAddress: string,
): Promise<WardPolicySnapshot | null> {
  try {
    const typeResult = await provider.callContract({
      contractAddress: wardAddress,
      entrypoint: "get_account_type",
      calldata: [],
    });
    if (typeResult[0] !== WARD_ACCOUNT_TYPE) return null;

    // Core calls that all ward contracts support
    const [guardianAddr, ward2fa, guardian2fa, requireAll, perTxnLimit] =
      await Promise.all([
        provider.callContract({
          contractAddress: wardAddress,
          entrypoint: "get_guardian_address",
          calldata: [],
        }),
        provider.callContract({
          contractAddress: wardAddress,
          entrypoint: "is_2fa_enabled",
          calldata: [],
        }),
        provider.callContract({
          contractAddress: wardAddress,
          entrypoint: "is_guardian_2fa_enabled",
          calldata: [],
        }),
        provider.callContract({
          contractAddress: wardAddress,
          entrypoint: "is_require_guardian_for_all",
          calldata: [],
        }),
        provider.callContract({
          contractAddress: wardAddress,
          entrypoint: "get_spending_limit_per_tx",
          calldata: [],
        }),
      ]);

    // Optional 24h-window calls — older ward contracts may not have these
    const [dailyLimit, spent24h] = await Promise.all([
      safeCall(provider, wardAddress, "get_spending_limit_24h"),
      safeCall(provider, wardAddress, "get_spent_24h"),
    ]);

    return {
      wardAddress: normalizeAddress(wardAddress),
      guardianAddress: normalizeAddress(guardianAddr[0]),
      wardHas2fa: ward2fa[0] !== "0x0",
      guardianHas2fa: guardian2fa[0] !== "0x0",
      requireGuardianForAll: requireAll[0] !== "0x0",
      maxPerTxn: feltToBigInt(perTxnLimit[0]),
      dailyLimit24h: feltToBigInt(dailyLimit[0]),
      spent24h: feltToBigInt(spent24h[0]),
    };
  } catch {
    return null;
  }
}
