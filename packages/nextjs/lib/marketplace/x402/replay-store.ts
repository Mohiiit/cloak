import { getSupabase } from "~~/app/api/v1/_lib/supabase";

export type X402ReplayStatus = "pending" | "settled" | "rejected";

export interface X402ReplayRecord {
  replay_key: string;
  payment_ref: string;
  status: X402ReplayStatus;
  settlement_tx_hash: string | null;
  reason_code: string | null;
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
  };
}

function hasSupabaseEnv(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export class X402ReplayStore {
  async get(replayKey: string): Promise<X402ReplayRecord | null> {
    if (hasSupabaseEnv()) {
      try {
        const sb = getSupabase();
        const rows = await sb.select<X402ReplayRecord>(
          "x402_payments",
          `replay_key=eq.${encodeURIComponent(replayKey)}`,
          { limit: 1 },
        );
        return rows[0] ?? null;
      } catch {
        // fall through to in-memory store for local/dev tests
      }
    }
    const found = inMemoryReplayStore.get(replayKey);
    return found ? cloneRecord(found) : null;
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
      settlement_tx_hash: null,
      reason_code: null,
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
      settlement_tx_hash: txHash,
      reason_code: null,
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
      reason_code: reasonCode,
      settlement_tx_hash: null,
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
