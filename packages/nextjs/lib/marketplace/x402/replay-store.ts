import { getSupabase } from "~~/app/api/v1/_lib/supabase";

export type X402ReplayStatus = "pending" | "settled" | "rejected";

export interface X402ReplayRecord {
  replay_key: string;
  payment_ref: string;
  status: X402ReplayStatus;
  state?: X402ReplayStatus;
  settlement_tx_hash: string | null;
  reason_code: string | null;
  challenge_id?: string | null;
  payer_address?: string | null;
  recipient_address?: string | null;
  token_address?: string | null;
  amount?: string | null;
  proof_digest?: string | null;
  network?: string | null;
  settled_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
}

const inMemoryReplayStore = new Map<string, X402ReplayRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

function cloneRecord(record: X402ReplayRecord): X402ReplayRecord {
  return {
    ...record,
    state: record.state || record.status,
    settled_at: record.settled_at ?? null,
    failure_reason: record.failure_reason ?? null,
  };
}

function hasSupabaseEnv(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export class X402ReplayStore {
  private normalize(record: X402ReplayRecord): X402ReplayRecord {
    const status = record.status || (record.state as X402ReplayStatus) || "pending";
    return {
      ...record,
      status,
      state: status,
      failure_reason: record.failure_reason ?? record.reason_code ?? null,
    };
  }

  async get(replayKey: string): Promise<X402ReplayRecord | null> {
    if (hasSupabaseEnv()) {
      try {
        const sb = getSupabase();
        const rows = await sb.select<X402ReplayRecord>(
          "x402_payments",
          `replay_key=eq.${encodeURIComponent(replayKey)}`,
          { limit: 1 },
        );
        const row = rows[0];
        return row ? this.normalize(row) : null;
      } catch {
        // fall through to in-memory store for local/dev tests
      }
    }
    const found = inMemoryReplayStore.get(replayKey);
    return found ? cloneRecord(found) : null;
  }

  async getByPaymentRef(paymentRef: string): Promise<X402ReplayRecord | null> {
    if (hasSupabaseEnv()) {
      try {
        const sb = getSupabase();
        const rows = await sb.select<X402ReplayRecord>(
          "x402_payments",
          `payment_ref=eq.${encodeURIComponent(paymentRef)}`,
          { limit: 1, orderBy: "updated_at.desc" },
        );
        const row = rows[0];
        return row ? this.normalize(row) : null;
      } catch {
        // fall through
      }
    }
    for (const record of inMemoryReplayStore.values()) {
      if (record.payment_ref === paymentRef) {
        return cloneRecord(record);
      }
    }
    return null;
  }

  async listPending(limit = 100): Promise<X402ReplayRecord[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 500));
    if (hasSupabaseEnv()) {
      try {
        const sb = getSupabase();
        const rows = await sb.select<X402ReplayRecord>(
          "x402_payments",
          "status=eq.pending",
          {
            orderBy: "updated_at.asc",
            limit: boundedLimit,
          },
        );
        return rows.map(row => this.normalize(row));
      } catch {
        // fall through
      }
    }
    return [...inMemoryReplayStore.values()]
      .filter(record => record.status === "pending")
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .slice(0, boundedLimit)
      .map(cloneRecord);
  }

  async registerPending(
    replayKey: string,
    paymentRef: string,
  ): Promise<X402ReplayRecord> {
    const existing = await this.get(replayKey);
    if (existing) return existing;

    const record: X402ReplayRecord = {
      replay_key: replayKey,
      payment_ref: paymentRef,
      status: "pending",
      state: "pending",
      settlement_tx_hash: null,
      reason_code: null,
      settled_at: null,
      failure_reason: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    if (hasSupabaseEnv()) {
      try {
        const sb = getSupabase();
        const rows = await sb.upsert<X402ReplayRecord>(
          "x402_payments",
          record as unknown as Record<string, unknown>,
          "replay_key",
        );
        return rows[0] ?? record;
      } catch {
        // fallback
      }
    }

    inMemoryReplayStore.set(replayKey, record);
    return cloneRecord(record);
  }

  async markSettled(
    replayKey: string,
    paymentRef: string,
    txHash: string,
  ): Promise<X402ReplayRecord> {
    const base = (await this.get(replayKey)) ?? {
      replay_key: replayKey,
      payment_ref: paymentRef,
      status: "pending" as const,
      settlement_tx_hash: null,
      reason_code: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    const updated: X402ReplayRecord = {
      ...base,
      payment_ref: paymentRef,
      status: "settled",
      state: "settled",
      settlement_tx_hash: txHash,
      reason_code: null,
      settled_at: nowIso(),
      failure_reason: null,
      updated_at: nowIso(),
    };

    if (hasSupabaseEnv()) {
      try {
        const sb = getSupabase();
        const rows = await sb.upsert<X402ReplayRecord>(
          "x402_payments",
          updated as unknown as Record<string, unknown>,
          "replay_key",
        );
        return rows[0] ?? updated;
      } catch {
        // fallback
      }
    }

    inMemoryReplayStore.set(replayKey, updated);
    return cloneRecord(updated);
  }

  async markPending(
    replayKey: string,
    paymentRef: string,
    txHash?: string | null,
  ): Promise<X402ReplayRecord> {
    const base = (await this.get(replayKey)) ?? {
      replay_key: replayKey,
      payment_ref: paymentRef,
      status: "pending" as const,
      settlement_tx_hash: null,
      reason_code: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    const updated: X402ReplayRecord = {
      ...base,
      payment_ref: paymentRef,
      status: "pending",
      state: "pending",
      settlement_tx_hash: txHash ?? base.settlement_tx_hash ?? null,
      reason_code: null,
      settled_at: null,
      failure_reason: null,
      updated_at: nowIso(),
    };

    if (hasSupabaseEnv()) {
      try {
        const sb = getSupabase();
        const rows = await sb.upsert<X402ReplayRecord>(
          "x402_payments",
          updated as unknown as Record<string, unknown>,
          "replay_key",
        );
        return rows[0] ?? updated;
      } catch {
        // fallback
      }
    }

    inMemoryReplayStore.set(replayKey, updated);
    return cloneRecord(updated);
  }

  async markRejected(
    replayKey: string,
    paymentRef: string,
    reasonCode: string,
  ): Promise<X402ReplayRecord> {
    const base = (await this.get(replayKey)) ?? {
      replay_key: replayKey,
      payment_ref: paymentRef,
      status: "pending" as const,
      settlement_tx_hash: null,
      reason_code: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const updated: X402ReplayRecord = {
      ...base,
      payment_ref: paymentRef,
      status: "rejected",
      state: "rejected",
      reason_code: reasonCode,
      settlement_tx_hash: null,
      settled_at: null,
      failure_reason: reasonCode,
      updated_at: nowIso(),
    };

    if (hasSupabaseEnv()) {
      try {
        const sb = getSupabase();
        const rows = await sb.upsert<X402ReplayRecord>(
          "x402_payments",
          updated as unknown as Record<string, unknown>,
          "replay_key",
        );
        return rows[0] ?? updated;
      } catch {
        // fallback
      }
    }

    inMemoryReplayStore.set(replayKey, updated);
    return cloneRecord(updated);
  }

  clearInMemory(): void {
    inMemoryReplayStore.clear();
  }
}
