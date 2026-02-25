import { normalizeAddress } from "@cloak-wallet/sdk";
import { getSupabase, type SupabaseClient } from "~~/app/api/v1/_lib/supabase";

type TransactionRow = {
  wallet_address: string;
  tx_hash: string;
  type: string;
  token: string;
  amount?: string | null;
  recipient?: string | null;
  status: string;
  created_at?: string;
};

type WardApprovalRow = {
  id: string;
  ward_address: string;
  guardian_address: string;
  action: string;
  token: string;
  amount: string | null;
  recipient: string | null;
  status: string;
  tx_hash: string;
  final_tx_hash: string | null;
  created_at?: string;
};

type AgentActivityRow = {
  tx_hash: string;
  type: string;
  token: string;
  amount?: string | null;
  recipient?: string | null;
  status: "pending" | "confirmed" | "failed" | "rejected" | "gas_error" | "expired";
  created_at?: string;
};

function asTimestamp(value?: string): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function mapTransactionStatus(status: string): AgentActivityRow["status"] {
  if (status === "confirmed") return "confirmed";
  if (status === "failed") return "failed";
  return "pending";
}

function mapWardRequestStatus(status: string): AgentActivityRow["status"] {
  switch (status) {
    case "approved":
      return "confirmed";
    case "rejected":
      return "rejected";
    case "gas_error":
      return "gas_error";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}

async function queryTransactionRows(
  sb: SupabaseClient,
  normalized: string,
): Promise<TransactionRow[]> {
  const [byWallet, byWard] = await Promise.all([
    sb.select<TransactionRow>("transactions", `wallet_address=eq.${normalized}`, {
      orderBy: "created_at.desc",
    }),
    sb.select<TransactionRow>("transactions", `ward_address=eq.${normalized}`, {
      orderBy: "created_at.desc",
    }),
  ]);

  let byManagedWards: TransactionRow[] = [];
  try {
    const wardRows = await sb.select<{ ward_address: string }>(
      "ward_configs",
      `guardian_address=eq.${normalized}`,
    );
    const managedWards = Array.from(
      new Set(
        wardRows
          .map((row) => normalizeAddress(row.ward_address))
          .filter((addr) => addr !== "0x0"),
      ),
    );
    if (managedWards.length > 0) {
      const inClause = managedWards.join(",");
      byManagedWards = await sb.select<TransactionRow>(
        "transactions",
        `wallet_address=in.(${inClause})`,
        { orderBy: "created_at.desc" },
      );
    }
  } catch (err) {
    console.warn("[agent/activity-source] managed ward lookup failed:", err);
  }

  const seen = new Set<string>();
  const all: TransactionRow[] = [];
  for (const row of [...byWallet, ...byWard, ...byManagedWards]) {
    const hash = row.tx_hash || "";
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    all.push(row);
  }
  return all;
}

async function queryWardApprovalRows(
  sb: SupabaseClient,
  normalized: string,
): Promise<WardApprovalRow[]> {
  try {
    const [asGuardian, asWard] = await Promise.all([
      sb.select<WardApprovalRow>(
        "ward_approval_requests",
        `guardian_address=eq.${normalized}`,
        { orderBy: "created_at.desc" },
      ),
      sb.select<WardApprovalRow>(
        "ward_approval_requests",
        `ward_address=eq.${normalized}`,
        { orderBy: "created_at.desc" },
      ),
    ]);

    const seenIds = new Set<string>();
    const all: WardApprovalRow[] = [];
    for (const row of [...asGuardian, ...asWard]) {
      if (!row?.id || seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      all.push(row);
    }
    return all;
  } catch (err) {
    console.warn("[agent/activity-source] ward request lookup failed:", err);
    return [];
  }
}

export async function listAgentActivity(
  address: string,
  limit = 6,
): Promise<{ records: AgentActivityRow[]; total: number }> {
  const normalized = normalizeAddress(address);
  const sb = getSupabase();

  const [txRows, wardRows] = await Promise.all([
    queryTransactionRows(sb, normalized),
    queryWardApprovalRows(sb, normalized),
  ]);

  const seenTxHashes = new Set(txRows.map((row) => row.tx_hash).filter(Boolean));

  const txRecords: AgentActivityRow[] = txRows.map((row) => ({
    tx_hash: row.tx_hash,
    type: row.type,
    token: row.token,
    amount: row.amount ?? null,
    recipient: row.recipient ?? null,
    status: mapTransactionStatus(row.status),
    created_at: row.created_at,
  }));

  const wardRecords: AgentActivityRow[] = wardRows
    .filter((row) => {
      const hash = row.final_tx_hash || row.tx_hash || "";
      if (!hash) return true;
      return !seenTxHashes.has(hash);
    })
    .map((row) => ({
      tx_hash: row.final_tx_hash || row.tx_hash || "",
      type: row.action || "transfer",
      token: row.token || "STRK",
      amount: row.amount ?? null,
      recipient: row.recipient ?? null,
      status: mapWardRequestStatus(row.status),
      created_at: row.created_at,
    }));

  const combined = [...txRecords, ...wardRecords];
  combined.sort((a, b) => asTimestamp(b.created_at) - asTimestamp(a.created_at));

  const max = Math.max(1, limit);
  return {
    records: combined.slice(0, max),
    total: combined.length,
  };
}
