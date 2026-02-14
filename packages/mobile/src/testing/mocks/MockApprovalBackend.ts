import type {
  ApprovalBackend,
  ApprovalRequestRecord,
  ApprovalStatus,
  SupabaseLiteLike,
  TwoFactorConfigRecord,
} from "../interfaces/ApprovalBackend";
import { loadActiveScenarioFixture } from "../fixtures/loadScenarioFixture";

type MockFixture = {
  biometricPrompts?: boolean[];
  approval_requests: ApprovalRequestRecord[];
  two_factor_configs: TwoFactorConfigRecord[];
  ward_configs: Record<string, any>[];
  ward_approval_requests: Record<string, any>[];
};

type Tables = Record<string, Record<string, any>[]>;

type Predicate = {
  field: string;
  op: string;
  value: string;
};

type ParsedFilters = {
  predicates: Predicate[];
  order?: string;
  limit?: number;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseFilters(filters?: string, orderBy?: string): ParsedFilters {
  const parsed: ParsedFilters = { predicates: [] };
  if (orderBy) {
    parsed.order = orderBy;
  }

  if (!filters) return parsed;

  for (const rawPart of filters.split("&")) {
    const part = rawPart.trim();
    if (!part) continue;

    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = safeDecode(part.slice(0, eqIndex));
    const expr = safeDecode(part.slice(eqIndex + 1));

    if (key === "order") {
      parsed.order = expr;
      continue;
    }

    if (key === "limit") {
      const n = Number(expr);
      if (Number.isFinite(n) && n >= 0) {
        parsed.limit = n;
      }
      continue;
    }

    const dotIndex = expr.indexOf(".");
    if (dotIndex <= 0) continue;

    parsed.predicates.push({
      field: key,
      op: expr.slice(0, dotIndex),
      value: expr.slice(dotIndex + 1),
    });
  }

  return parsed;
}

function compareValues(left: any, right: string): number {
  const leftStr = left == null ? "" : String(left);
  const rightStr = right;

  if (/^-?\d+$/.test(leftStr) && /^-?\d+$/.test(rightStr)) {
    try {
      const l = BigInt(leftStr);
      const r = BigInt(rightStr);
      if (l === r) return 0;
      return l > r ? 1 : -1;
    } catch {
      // Fall through to string compare.
    }
  }

  const leftNum = Number(leftStr);
  const rightNum = Number(rightStr);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    if (leftNum === rightNum) return 0;
    return leftNum > rightNum ? 1 : -1;
  }

  if (leftStr === rightStr) return 0;
  return leftStr > rightStr ? 1 : -1;
}

function matchesPredicate(row: Record<string, any>, predicate: Predicate): boolean {
  const value = row[predicate.field];

  switch (predicate.op) {
    case "eq":
      return String(value) === predicate.value;
    case "neq":
      return String(value) !== predicate.value;
    case "gt":
      return compareValues(value, predicate.value) > 0;
    case "gte":
      return compareValues(value, predicate.value) >= 0;
    case "lt":
      return compareValues(value, predicate.value) < 0;
    case "lte":
      return compareValues(value, predicate.value) <= 0;
    default:
      return true;
  }
}

function matchesAll(row: Record<string, any>, predicates: Predicate[]): boolean {
  return predicates.every((predicate) => matchesPredicate(row, predicate));
}

function applyOrder(rows: Record<string, any>[], order?: string): Record<string, any>[] {
  if (!order) return rows;

  const [field, direction = "asc"] = order.split(".");
  const dir = direction.toLowerCase() === "desc" ? -1 : 1;

  return [...rows].sort((a, b) => compareValues(a[field], String(b[field])) * dir);
}

class InMemorySupabaseLite implements SupabaseLiteLike {
  constructor(private readonly tables: Tables) {}

  async insert<T = any>(table: string, data: Record<string, any>): Promise<T[]> {
    const rows = this.getTable(table);
    const row = { ...data };
    if (!row.id) {
      row.id = `${table}_${rows.length + 1}_${Date.now()}`;
    }
    if (!row.created_at) {
      row.created_at = new Date().toISOString();
    }
    rows.push(row);
    return clone([row]) as T[];
  }

  async select<T = any>(table: string, filters?: string, orderBy?: string): Promise<T[]> {
    const rows = this.getTable(table);
    const parsed = parseFilters(filters, orderBy);
    let out = rows.filter((row) => matchesAll(row, parsed.predicates));
    out = applyOrder(out, parsed.order);
    if (typeof parsed.limit === "number") {
      out = out.slice(0, parsed.limit);
    }
    return clone(out) as T[];
  }

  async update<T = any>(
    table: string,
    filters: string,
    data: Record<string, any>,
  ): Promise<T[]> {
    const rows = this.getTable(table);
    const parsed = parseFilters(filters);
    const updated: Record<string, any>[] = [];

    for (const row of rows) {
      if (!matchesAll(row, parsed.predicates)) continue;
      Object.assign(row, data);
      updated.push({ ...row });
    }

    return clone(updated) as T[];
  }

  async delete(table: string, filters: string): Promise<void> {
    const parsed = parseFilters(filters);
    this.tables[table] = this.getTable(table).filter(
      (row) => !matchesAll(row, parsed.predicates),
    );
  }

  poll(
    table: string,
    filters: string,
    intervalMs: number,
    callback: (rows: any[]) => void,
  ): () => void {
    let active = true;

    const tick = async () => {
      if (!active) return;
      try {
        const rows = await this.select(table, filters, "created_at.desc");
        callback(rows);
      } catch {
        // Polling retries naturally.
      }
      if (active) {
        setTimeout(tick, intervalMs);
      }
    };

    tick();

    return () => {
      active = false;
    };
  }

  private getTable(table: string): Record<string, any>[] {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    return this.tables[table];
  }
}

export class MockApprovalBackend implements ApprovalBackend {
  readonly mode = "e2e-mock" as const;

  private readonly supabase: InMemorySupabaseLite;

  constructor() {
    const fixture =
      loadActiveScenarioFixture<MockFixture>("approvalBackend");
    const tables = clone({
      approval_requests: fixture.approval_requests ?? [],
      two_factor_configs: fixture.two_factor_configs ?? [],
      ward_configs: fixture.ward_configs ?? [],
      ward_approval_requests: fixture.ward_approval_requests ?? [],
    }) as Tables;
    this.supabase = new InMemorySupabaseLite(tables);
  }

  async getSupabaseLite(): Promise<SupabaseLiteLike> {
    return this.supabase;
  }

  async fetchPendingRequests(walletAddress: string): Promise<ApprovalRequestRecord[]> {
    return this.supabase.select<ApprovalRequestRecord>(
      "approval_requests",
      `status=eq.pending&wallet_address=eq.${walletAddress}&order=created_at.desc`,
    );
  }

  async updateRequestStatus(
    id: string,
    status: ApprovalStatus,
    finalTxHash?: string,
    errorMessage?: string,
  ): Promise<any> {
    const body: Record<string, any> = {
      status,
      responded_at: new Date().toISOString(),
    };
    if (finalTxHash) body.final_tx_hash = finalTxHash;
    if (errorMessage) body.error_message = errorMessage;

    const updated = await this.supabase.update(
      "approval_requests",
      `id=eq.${id}`,
      body,
    );

    return updated[0] ?? null;
  }

  async enableTwoFactorConfig(
    walletAddress: string,
    secondaryPubKey: string,
  ): Promise<any> {
    const existing = await this.supabase.select<TwoFactorConfigRecord>(
      "two_factor_configs",
      `wallet_address=eq.${walletAddress}&limit=1`,
    );

    if (existing.length > 0) {
      return this.supabase.update(
        "two_factor_configs",
        `wallet_address=eq.${walletAddress}`,
        {
          secondary_public_key: secondaryPubKey,
          is_enabled: true,
        },
      );
    }

    return this.supabase.insert("two_factor_configs", {
      wallet_address: walletAddress,
      secondary_public_key: secondaryPubKey,
      is_enabled: true,
      created_at: new Date().toISOString(),
    });
  }

  async disableTwoFactorConfig(walletAddress: string): Promise<any> {
    await this.supabase.delete(
      "two_factor_configs",
      `wallet_address=eq.${walletAddress}`,
    );
    return null;
  }

  async isTwoFactorConfigured(
    walletAddress: string,
  ): Promise<TwoFactorConfigRecord | null> {
    const data = await this.supabase.select<TwoFactorConfigRecord>(
      "two_factor_configs",
      `wallet_address=eq.${walletAddress}&limit=1`,
    );
    return data[0] ?? null;
  }
}
