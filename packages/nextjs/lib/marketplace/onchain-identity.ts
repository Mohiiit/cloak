import { ERC8004Client } from "@cloak-wallet/sdk";

type AgentOnchainStatus = "skipped" | "verified" | "mismatch" | "unknown";

export interface OnchainIdentitySubject {
  agentId: string;
  operatorWallet: string;
}

export interface OnchainIdentityCheck {
  enforced: boolean;
  verified: boolean;
  status: AgentOnchainStatus;
  owner: string | null;
  reason: string | null;
  checkedAt: string;
}

interface OnchainIdentityOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  client?: Pick<ERC8004Client, "ownerOf">;
  ownerEntrypoint?: string;
  checkWhenDisabled?: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  const normalized = value
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/^0x0+/, "0x");
}

function toNumberishAgentId(agentId: string): string | number {
  return /^\d+$/.test(agentId) ? Number(agentId) : agentId;
}

function resolveNetwork(
  env: Partial<NodeJS.ProcessEnv>,
): "mainnet" | "sepolia" {
  return env.AGENTIC_MARKETPLACE_NETWORK === "mainnet" ? "mainnet" : "sepolia";
}

export function isOnchainIdentityEnforced(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return parseBoolean(env.MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY, false);
}

export async function checkAgentOnchainIdentity(
  subject: OnchainIdentitySubject,
  options: OnchainIdentityOptions = {},
): Promise<OnchainIdentityCheck> {
  const env = options.env ?? process.env;
  const enforced = isOnchainIdentityEnforced(env);
  const checkedAt = new Date().toISOString();

  if (!enforced && !options.checkWhenDisabled) {
    return {
      enforced: false,
      verified: false,
      status: "skipped",
      owner: null,
      reason: null,
      checkedAt,
    };
  }

  const ownerEntrypoint = options.ownerEntrypoint || env.ERC8004_OWNER_ENTRYPOINT || "owner_of";
  const network = resolveNetwork(env);
  const rpcUrl =
    env.CLOAK_SEPOLIA_RPC_URL ||
    env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL;
  const client =
    options.client ||
    new ERC8004Client({
      network,
      rpcUrl,
    });

  try {
    const owner = await client.ownerOf(
      toNumberishAgentId(subject.agentId),
      ownerEntrypoint,
    );
    if (!owner) {
      return {
        enforced,
        verified: false,
        status: "unknown",
        owner: null,
        reason: "owner_unavailable",
        checkedAt,
      };
    }

    const verified =
      normalizeAddress(owner) === normalizeAddress(subject.operatorWallet);

    return {
      enforced,
      verified,
      status: verified ? "verified" : "mismatch",
      owner,
      reason: verified ? null : "operator_owner_mismatch",
      checkedAt,
    };
  } catch {
    return {
      enforced,
      verified: false,
      status: "unknown",
      owner: null,
      reason: "lookup_failed",
      checkedAt,
    };
  }
}
