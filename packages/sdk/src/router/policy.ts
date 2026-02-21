import { TOKENS } from "../tokens";

export type WardPolicyReason =
  | "REQUIRE_GUARDIAN_FOR_ALL"
  | "EXCEEDS_MAX_PER_TXN"
  | "EXCEEDS_DAILY_LIMIT"
  | "UNKNOWN_SPEND";

export interface WardPolicySnapshot {
  wardAddress: string;
  guardianAddress: string;
  wardHas2fa: boolean;
  guardianHas2fa: boolean;
  requireGuardianForAll: boolean;
  maxPerTxn: bigint;
  dailyLimit24h: bigint;
  spent24h: bigint;
}

export interface RouterCall {
  contractAddress?: string;
  contract_address?: string;
  to?: string;
  entrypoint?: string;
  entry_point?: string;
  selector?: string;
  calldata?: Array<string | number | bigint>;
}

export interface WardExecutionDecision {
  needsGuardian: boolean;
  needsWard2fa: boolean;
  needsGuardian2fa: boolean;
  reasons: WardPolicyReason[];
  evaluatedSpend: bigint | null;
  projectedSpent24h: bigint | null;
}

interface SpendParseResult {
  spend: bigint | null;
  unknown: boolean;
  allSelf: boolean;
}

const ERC20_SPEND_ENTRYPOINTS = new Set(["transfer", "approve"]);
const KNOWN_TOKEN_ADDRESSES = new Set(
  Object.values(TOKENS).map((t) => normalizeAddress(t.erc20Address)),
);

function normalizeAddress(addr: string): string {
  const lower = addr.toLowerCase();
  if (!lower.startsWith("0x")) return lower;
  const stripped = lower.slice(2).replace(/^0+/, "");
  return `0x${stripped || "0"}`;
}

function toBigIntSafe(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

function getCallAddress(call: RouterCall): string | null {
  const address = call.contractAddress || call.contract_address || call.to || null;
  return address ? normalizeAddress(address) : null;
}

function getEntrypoint(call: RouterCall): string | null {
  const entrypoint = call.entrypoint || call.entry_point || call.selector || null;
  return entrypoint ? entrypoint.toLowerCase() : null;
}

export function parseSpendFromCalls(
  snapshot: WardPolicySnapshot,
  calls: RouterCall[],
): SpendParseResult {
  const wardAddress = normalizeAddress(snapshot.wardAddress);

  let total = 0n;
  let unknown = false;
  let allSelf = true;

  for (const call of calls) {
    const to = getCallAddress(call);
    const entrypoint = getEntrypoint(call);

    if (!to) {
      unknown = true;
      allSelf = false;
      continue;
    }

    if (to !== wardAddress) {
      allSelf = false;
    }

    if (KNOWN_TOKEN_ADDRESSES.has(to)) {
      if (!entrypoint || !ERC20_SPEND_ENTRYPOINTS.has(entrypoint)) {
        continue;
      }
      const amountLow = call.calldata?.[1];
      const parsed = toBigIntSafe(amountLow);
      if (parsed === null) {
        unknown = true;
        continue;
      }
      total += parsed;
      continue;
    }

    if (to !== wardAddress) {
      unknown = true;
    }
  }

  return {
    spend: unknown ? null : total,
    unknown,
    allSelf,
  };
}

export function evaluateWardExecutionPolicy(
  snapshot: WardPolicySnapshot,
  calls: RouterCall[],
): WardExecutionDecision {
  const reasons: WardPolicyReason[] = [];
  const spendParse = parseSpendFromCalls(snapshot, calls);

  if (snapshot.requireGuardianForAll && !spendParse.allSelf) {
    reasons.push("REQUIRE_GUARDIAN_FOR_ALL");
  } else if (spendParse.unknown) {
    reasons.push("UNKNOWN_SPEND");
  } else {
    const spend = spendParse.spend ?? 0n;

    // Match contract behavior: zero spend does not consume per-tx/daily budget.
    if (spend > 0n) {
      if (snapshot.maxPerTxn > 0n && spend > snapshot.maxPerTxn) {
        reasons.push("EXCEEDS_MAX_PER_TXN");
      }

      if (snapshot.dailyLimit24h > 0n) {
        const projected = snapshot.spent24h + spend;
        if (projected > snapshot.dailyLimit24h) {
          reasons.push("EXCEEDS_DAILY_LIMIT");
        }
      }
    }
  }

  const needsGuardian = reasons.length > 0;
  const evaluatedSpend = spendParse.spend;
  const projectedSpent24h =
    evaluatedSpend === null ? null : snapshot.spent24h + evaluatedSpend;

  return {
    needsGuardian,
    needsWard2fa: snapshot.wardHas2fa,
    needsGuardian2fa: needsGuardian && snapshot.guardianHas2fa,
    reasons,
    evaluatedSpend,
    projectedSpent24h,
  };
}
