import { describe, expect, it } from "vitest";
import { getActivityRecords } from "../src/activity";
import {
  createWardApprovalRequest,
  updateWardApprovalRequest,
  type WardApprovalStatus,
} from "../src/ward";
import { saveTransaction } from "../src/transactions";
import type { AmountUnit } from "../src/token-convert";
import type { WardApprovalResponse, TransactionResponse } from "../src/types/api";

type Row = Record<string, any>;

class InMemoryApiClient {
  private wardApprovals: Row[] = [];
  private transactions: Row[] = [];
  private wardConfigs: Row[] = [];
  private seq = 1;
  private clock = Date.parse("2026-02-21T00:00:00.000Z");

  private nowIso(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  // ─── Ward Approvals ──────────────────────────────────────────────────────

  async createWardApproval(body: any): Promise<WardApprovalResponse> {
    const now = this.nowIso();
    const row: Row = {
      ...body,
      id: `ward-approval-${this.seq++}`,
      created_at: now,
      expires_at: new Date(new Date(now).getTime() + 10 * 60 * 1000).toISOString(),
      responded_at: null,
      ward_2fa_sig_json: body.ward_2fa_sig_json ?? null,
      guardian_sig_json: body.guardian_sig_json ?? null,
      guardian_2fa_sig_json: body.guardian_2fa_sig_json ?? null,
      final_tx_hash: body.final_tx_hash ?? null,
      error_message: body.error_message ?? null,
      status: body.initial_status || "pending_ward_sig",
    };
    this.wardApprovals.push(row);
    return { ...row } as WardApprovalResponse;
  }

  async getWardApproval(id: string): Promise<WardApprovalResponse> {
    const row = this.wardApprovals.find((r) => r.id === id);
    if (!row) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    return { ...row } as WardApprovalResponse;
  }

  async updateWardApproval(id: string, body: any): Promise<void> {
    const row = this.wardApprovals.find((r) => r.id === id);
    if (row) Object.assign(row, body);
  }

  async getPendingWardApprovals(_params: any): Promise<WardApprovalResponse[]> {
    return this.wardApprovals
      .filter(
        (r) =>
          r.status === "pending_ward_sig" || r.status === "pending_guardian",
      )
      .map((r) => ({ ...r }) as WardApprovalResponse);
  }

  async getWardApprovalHistory(_params: any): Promise<WardApprovalResponse[]> {
    return this.wardApprovals.map((r) => ({ ...r }) as WardApprovalResponse);
  }

  // ─── Transactions ────────────────────────────────────────────────────────

  async saveTransaction(body: any): Promise<TransactionResponse> {
    const row: Row = {
      ...body,
      id: `tx-${this.seq++}`,
      created_at: this.nowIso(),
      // Fill in nullable fields that TransactionResponse requires
      amount: body.amount ?? null,
      amount_unit: body.amount_unit ?? null,
      recipient: body.recipient ?? null,
      recipient_name: body.recipient_name ?? null,
      note: body.note ?? null,
      error_message: body.error_message ?? null,
      ward_address: body.ward_address ?? null,
      fee: body.fee ?? null,
      platform: body.platform ?? null,
    };
    this.transactions.push(row);
    return { ...row } as TransactionResponse;
  }

  // ─── Activity ────────────────────────────────────────────────────────────

  async getActivity(wallet: string, opts?: any) {
    const normalizedWallet = wallet.toLowerCase().replace(/^0x0+/, "0x");
    const records: any[] = [];

    // Transactions for this wallet
    for (const tx of this.transactions) {
      const txWallet = (tx.wallet_address || "")
        .toLowerCase()
        .replace(/^0x0+/, "0x");
      if (txWallet === normalizedWallet) {
        records.push({
          id: tx.tx_hash || tx.id,
          source: "transaction",
          wallet_address: tx.wallet_address,
          tx_hash: tx.tx_hash,
          type: tx.type,
          token: tx.token,
          amount: tx.amount ?? null,
          amount_unit: tx.amount_unit ?? null,
          recipient: tx.recipient ?? null,
          recipient_name: tx.recipient_name ?? null,
          note: tx.note ?? null,
          status:
            tx.status === "confirmed"
              ? "confirmed"
              : tx.status === "failed"
                ? "failed"
                : "pending",
          error_message: tx.error_message ?? null,
          account_type: tx.account_type,
          ward_address: tx.ward_address ?? null,
          fee: tx.fee ?? null,
          network: tx.network,
          platform: tx.platform ?? null,
          created_at: tx.created_at,
          swap: null,
        });
      }
    }

    const seenTxHashes = new Set(
      records.map((r) => r.tx_hash).filter(Boolean),
    );

    // Managed ward transactions (guardian sees ward's transactions)
    for (const config of this.wardConfigs) {
      const guardianAddr = (config.guardian_address || "")
        .toLowerCase()
        .replace(/^0x0+/, "0x");
      if (guardianAddr !== normalizedWallet) continue;
      const wardAddr = (config.ward_address || "")
        .toLowerCase()
        .replace(/^0x0+/, "0x");
      for (const tx of this.transactions) {
        const txWallet = (tx.wallet_address || "")
          .toLowerCase()
          .replace(/^0x0+/, "0x");
        if (txWallet === wardAddr && !seenTxHashes.has(tx.tx_hash)) {
          seenTxHashes.add(tx.tx_hash);
          records.push({
            id: tx.tx_hash || tx.id,
            source: "transaction",
            wallet_address: tx.wallet_address,
            tx_hash: tx.tx_hash,
            type: tx.type,
            token: tx.token,
            amount: tx.amount ?? null,
            amount_unit: tx.amount_unit ?? null,
            recipient: tx.recipient ?? null,
            recipient_name: tx.recipient_name ?? null,
            note: tx.note ?? null,
            status:
              tx.status === "confirmed"
                ? "confirmed"
                : tx.status === "failed"
                  ? "failed"
                  : "pending",
            error_message: tx.error_message ?? null,
            account_type: tx.account_type,
            ward_address: tx.ward_address ?? null,
            fee: tx.fee ?? null,
            network: tx.network,
            platform: tx.platform ?? null,
            created_at: tx.created_at,
            swap: null,
          });
        }
      }
    }

    // Ward approvals where viewer is guardian or ward (deduped against transactions)
    for (const req of this.wardApprovals) {
      const guardian = (req.guardian_address || "")
        .toLowerCase()
        .replace(/^0x0+/, "0x");
      const ward = (req.ward_address || "")
        .toLowerCase()
        .replace(/^0x0+/, "0x");
      if (guardian !== normalizedWallet && ward !== normalizedWallet) continue;
      const hash = req.final_tx_hash || req.tx_hash || "";
      if (hash && seenTxHashes.has(hash)) continue;

      const statusMap: Record<string, string> = {
        approved: "confirmed",
        rejected: "rejected",
        gas_error: "gas_error",
        failed: "failed",
        expired: "expired",
      };
      const noteMap: Record<string, string> = {
        pending_ward_sig: "Waiting for ward signature",
        pending_guardian: "Waiting for guardian approval",
        rejected: "Request rejected",
        gas_error: "Gas too low, retry required",
        expired: "Request expired",
      };

      records.push({
        id: req.id,
        source: "ward_request",
        wallet_address:
          guardian === normalizedWallet
            ? req.guardian_address
            : req.ward_address,
        tx_hash: hash,
        type: req.action || "transfer",
        token: req.token || "STRK",
        amount: req.amount ?? null,
        amount_unit: req.amount_unit ?? null,
        recipient: req.recipient ?? null,
        recipient_name: null,
        note: noteMap[req.status] ?? null,
        status: statusMap[req.status] ?? "pending",
        status_detail: req.status,
        error_message: req.error_message ?? null,
        account_type: "guardian",
        ward_address: req.ward_address,
        fee: null,
        network: "sepolia",
        platform: "approval",
        created_at: req.created_at,
        responded_at: req.responded_at ?? null,
        swap: null,
      });
      if (hash) seenTxHashes.add(hash);
    }

    records.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const limit = opts?.limit ?? 100;
    return {
      records: records.slice(0, limit),
      total: records.length,
      has_more: records.length > limit,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  addWardConfig(config: any) {
    this.wardConfigs.push(config);
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
    const client = new InMemoryApiClient();

    client.addWardConfig({
      ward_address: ADDRS.ward,
      guardian_address: ADDRS.guardian,
    });

    const request = await createWardApprovalRequest(client as any, {
      wardAddress: ADDRS.ward,
      guardianAddress: ADDRS.guardian,
      action: flow.action,
      token: "STRK",
      amount: flow.amount,
      amountUnit: flow.amountUnit,
      recipient: ADDRS.recipient,
      callsJson: "[]",
      wardSigJson: '["0x1","0x2"]',
      nonce: "0x1",
      resourceBoundsJson: "{}",
      txHash: flow.txHash || "",
      needsWard2fa: false,
      needsGuardian: true,
      needsGuardian2fa: false,
    });

    const updated = await updateWardApprovalRequest(client as any, request.id, {
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
        client as any,
      );
    }

    const guardianFeed = await getActivityRecords(
      ADDRS.guardian,
      20,
      client as any,
    );
    const wardFeed = await getActivityRecords(ADDRS.ward, 20, client as any);

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
    expect(guardianFeed[0].status).toBe(
      flow.status === "rejected" ? "rejected" : "expired",
    );
    if (flow.status === "expired") {
      expect(guardianFeed[0].note).toContain("expired");
    }

    expect(wardFeed[0].id).toBe(request.id);
    expect(wardFeed[0].source).toBe("ward_request");
    expect(wardFeed[0].status_detail).toBe(flow.status);
    expect(wardFeed[0].type).toBe(expectedType);
    expect(wardFeed[0].amount_unit).toBe(flow.amountUnit);
    expect(wardFeed[0].status).toBe(
      flow.status === "rejected" ? "rejected" : "expired",
    );
  });
});
