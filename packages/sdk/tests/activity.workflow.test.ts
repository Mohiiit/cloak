import { describe, expect, it } from "vitest";
import { getActivityRecords } from "../src/activity";
import {
  createWardApprovalRequest,
  updateWardApprovalRequest,
  type WardApprovalStatus,
} from "../src/ward";
import { saveTransaction } from "../src/transactions";
import type { AmountUnit } from "../src/token-convert";

type Row = Record<string, any>;

class InMemorySupabase {
  private tables: Record<string, Row[]> = {};
  private seq = 1;
  private clock = Date.parse("2026-02-21T00:00:00.000Z");

  private nowIso(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private table(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  private parseFilters(filters?: string): {
    clauses: Array<{ key: string; op: "eq" | "in"; values: string[] }>;
    limit?: number;
  } {
    const clauses: Array<{ key: string; op: "eq" | "in"; values: string[] }> = [];
    let limit: number | undefined;
    if (!filters) return { clauses, limit };

    for (const part of filters.split("&")) {
      const idx = part.indexOf("=");
      if (idx <= 0) continue;
      const key = part.slice(0, idx);
      const value = part.slice(idx + 1);
      if (key === "limit") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) limit = Math.floor(parsed);
        continue;
      }
      if (value.startsWith("eq.")) {
        clauses.push({ key, op: "eq", values: [value.slice(3)] });
        continue;
      }
      if (value.startsWith("in.(") && value.endsWith(")")) {
        const values = value
          .slice(4, -1)
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        clauses.push({ key, op: "in", values });
      }
    }
    return { clauses, limit };
  }

  private applyFilters(rows: Row[], filters?: string): Row[] {
    const { clauses, limit } = this.parseFilters(filters);
    let out = rows.filter((row) =>
      clauses.every((clause) => {
        const value = String(row[clause.key] ?? "");
        if (clause.op === "eq") return value === clause.values[0];
        return clause.values.includes(value);
      }),
    );
    if (typeof limit === "number") out = out.slice(0, limit);
    return out;
  }

  async insert<T = any>(table: string, data: Record<string, any>): Promise<T[]> {
    const row: Row = { ...data };
    if (!row.id) row.id = `${table}-${this.seq++}`;
    if (!row.created_at) row.created_at = this.nowIso();
    if (table === "ward_approval_requests" && !row.expires_at) {
      row.expires_at = new Date(new Date(row.created_at).getTime() + 10 * 60 * 1000).toISOString();
    }
    this.table(table).push(row);
    return [{ ...row }] as T[];
  }

  async select<T = any>(table: string, filters?: string, orderBy?: string): Promise<T[]> {
    let rows = this.applyFilters(this.table(table), filters).map((row) => ({ ...row }));
    if (orderBy) {
      const [field, direction] = orderBy.split(".");
      const sign = direction === "desc" ? -1 : 1;
      rows.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        const at = typeof av === "string" ? new Date(av).getTime() : Number(av ?? 0);
        const bt = typeof bv === "string" ? new Date(bv).getTime() : Number(bv ?? 0);
        if (Number.isFinite(at) && Number.isFinite(bt)) return (at - bt) * sign;
        return String(av ?? "").localeCompare(String(bv ?? "")) * sign;
      });
    }
    return rows as T[];
  }

  async update<T = any>(table: string, filters: string, data: Record<string, any>): Promise<T[]> {
    const rows = this.applyFilters(this.table(table), filters);
    for (const row of rows) Object.assign(row, data);
    return rows.map((row) => ({ ...row })) as T[];
  }
}

const ADDRS = {
  guardian: "0xaa",
  ward: "0xbb",
  recipient: "0xcc",
};

type FlowCase = {
  name: string;
  action: "transfer" | "erc20_transfer";
  amount: string;
  amountUnit: AmountUnit;
  status: WardApprovalStatus;
  txHash?: string;
};

const CASES: FlowCase[] = [
  {
    name: "private accepted",
    action: "transfer",
    amount: "20",
    amountUnit: "tongo_units",
    status: "approved",
    txHash: "0xprivateapproved",
  },
  {
    name: "private rejected",
    action: "transfer",
    amount: "20",
    amountUnit: "tongo_units",
    status: "rejected",
  },
  {
    name: "private timeout",
    action: "transfer",
    amount: "20",
    amountUnit: "tongo_units",
    status: "expired",
  },
  {
    name: "public accepted",
    action: "erc20_transfer",
    amount: "1.25",
    amountUnit: "erc20_display",
    status: "approved",
    txHash: "0xpublicapproved",
  },
  {
    name: "public rejected",
    action: "erc20_transfer",
    amount: "1.25",
    amountUnit: "erc20_display",
    status: "rejected",
  },
  {
    name: "public timeout",
    action: "erc20_transfer",
    amount: "1.25",
    amountUnit: "erc20_display",
    status: "expired",
  },
];

describe("activity workflow integration", () => {
  it.each(CASES)("covers $name via SDK lifecycle helpers", async (flow) => {
    const sb = new InMemorySupabase();

    await sb.insert("ward_configs", {
      ward_address: ADDRS.ward,
      guardian_address: ADDRS.guardian,
    });

    const request = await createWardApprovalRequest(sb as any, {
      wardAddress: ADDRS.ward,
      guardianAddress: ADDRS.guardian,
      action: flow.action,
      token: "STRK",
      amount: flow.amount,
      amountUnit: flow.amountUnit,
      recipient: ADDRS.recipient,
      callsJson: "[]",
      wardSigJson: "[\"0x1\",\"0x2\"]",
      nonce: "0x1",
      resourceBoundsJson: "{}",
      txHash: flow.txHash || "",
      needsWard2fa: false,
      needsGuardian: true,
      needsGuardian2fa: false,
    });

    const updated = await updateWardApprovalRequest(sb as any, request.id, {
      status: flow.status,
      txHash: flow.txHash || request.tx_hash,
      finalTxHash: flow.status === "approved" ? flow.txHash || null : null,
    });
    expect(updated?.status).toBe(flow.status);

    if (flow.status === "approved" && flow.txHash) {
      await saveTransaction(
        {
          wallet_address: ADDRS.ward,
          tx_hash: flow.txHash,
          type: flow.action,
          token: "STRK",
          amount: flow.amount,
          amount_unit: flow.amountUnit,
          recipient: ADDRS.recipient,
          status: "confirmed",
          account_type: "ward",
          network: "sepolia",
          platform: "sdk-test",
        },
        sb as any,
      );
    }

    const guardianFeed = await getActivityRecords(ADDRS.guardian, 20, sb as any);
    const wardFeed = await getActivityRecords(ADDRS.ward, 20, sb as any);

    expect(guardianFeed).toHaveLength(1);
    expect(wardFeed).toHaveLength(1);

    const expectedType = flow.action;

    if (flow.status === "approved" && flow.txHash) {
      expect(guardianFeed[0].id).toBe(flow.txHash);
      expect(guardianFeed[0].source).toBe("transaction");
      expect(guardianFeed[0].status).toBe("confirmed");
      expect(guardianFeed[0].type).toBe(expectedType);
      expect(guardianFeed[0].amount_unit).toBe(flow.amountUnit);

      expect(wardFeed[0].id).toBe(flow.txHash);
      expect(wardFeed[0].source).toBe("transaction");
      expect(wardFeed[0].status).toBe("confirmed");
      expect(wardFeed[0].type).toBe(expectedType);
      expect(wardFeed[0].amount_unit).toBe(flow.amountUnit);
      return;
    }

    expect(guardianFeed[0].id).toBe(request.id);
    expect(guardianFeed[0].source).toBe("ward_request");
    expect(guardianFeed[0].status_detail).toBe(flow.status);
    expect(guardianFeed[0].type).toBe(expectedType);
    expect(guardianFeed[0].amount_unit).toBe(flow.amountUnit);
    expect(guardianFeed[0].status).toBe(flow.status === "rejected" ? "rejected" : "expired");
    if (flow.status === "expired") {
      expect(guardianFeed[0].note).toContain("expired");
    }

    expect(wardFeed[0].id).toBe(request.id);
    expect(wardFeed[0].source).toBe("ward_request");
    expect(wardFeed[0].status_detail).toBe(flow.status);
    expect(wardFeed[0].type).toBe(expectedType);
    expect(wardFeed[0].amount_unit).toBe(flow.amountUnit);
    expect(wardFeed[0].status).toBe(flow.status === "rejected" ? "rejected" : "expired");
  });
});
