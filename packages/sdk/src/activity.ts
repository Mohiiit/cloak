import type { CloakApiClient } from "./api-client";
import type { ActivityRecordResponse } from "./types/api";
import type { AccountType, TransactionType } from "./transactions";
import { normalizeAddress } from "./ward";
import type { AmountUnit } from "./token-convert";

export type ActivitySource = "transaction" | "ward_request" | "agent_run";

export type ActivityStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "rejected"
  | "gas_error"
  | "expired";

export interface ActivityRecord {
  id: string;
  source: ActivitySource;
  wallet_address: string;
  tx_hash: string;
  type: TransactionType | string;
  token: string;
  amount?: string | null;
  amount_unit?: AmountUnit | null;
  recipient?: string | null;
  recipient_name?: string | null;
  note?: string | null;
  status: ActivityStatus;
  status_detail?: string;
  error_message?: string | null;
  account_type: AccountType;
  ward_address?: string | null;
  fee?: string | null;
  network: string;
  platform?: string | null;
  created_at?: string;
  responded_at?: string | null;
  agent_run?: {
    run_id: string;
    agent_id: string;
    action: string;
    billable: boolean;
    payment_ref: string | null;
    settlement_tx_hash: string | null;
    execution_tx_hashes: string[] | null;
  } | null;
  swap?: {
    execution_id?: string;
    provider: string;
    sell_token: string;
    buy_token: string;
    sell_amount_wei: string;
    estimated_buy_amount_wei: string;
    min_buy_amount_wei: string;
    buy_actual_amount_wei?: string | null;
    tx_hashes?: string[] | null;
    primary_tx_hash?: string | null;
    status?: string;
    failure_step_key?: string | null;
    failure_reason?: string | null;
    steps?: Array<{
      step_key: string;
      step_order: number;
      status: string;
      tx_hash?: string | null;
      message?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
    }>;
  } | null;
}

function toActivityRecord(res: ActivityRecordResponse): ActivityRecord {
  return {
    id: res.id,
    source: res.source,
    wallet_address: res.wallet_address,
    tx_hash: res.tx_hash,
    type: res.type as TransactionType | string,
    token: res.token,
    amount: res.amount,
    amount_unit: res.amount_unit,
    recipient: res.recipient,
    recipient_name: res.recipient_name,
    note: res.note,
    status: res.status,
    status_detail: res.status_detail,
    error_message: res.error_message,
    account_type: res.account_type,
    ward_address: res.ward_address,
    fee: res.fee,
    network: res.network,
    platform: res.platform,
    created_at: res.created_at,
    responded_at: res.responded_at,
    agent_run: res.agent_run ?? null,
    swap: res.swap ?? null,
  };
}

export async function getActivityRecords(
  walletAddress: string,
  limit = 100,
  client: CloakApiClient,
): Promise<ActivityRecord[]> {
  const normalized = normalizeAddress(walletAddress);
  const response = await client.getActivity(normalized, { limit });
  return response.records.map(toActivityRecord);
}
