import type { RpcProvider } from "starknet";
import type { SupabaseLite } from "../supabase";
import {
  saveTransaction,
  updateTransactionStatus,
  getTransactions,
  confirmTransaction,
  type TransactionRecord,
  type TransactionStatus,
} from "../transactions";
import type { AmountUnit } from "../token-convert";

export interface CanonicalAmount {
  value: string;
  unit: AmountUnit;
  display?: string;
}

export interface SaveTransactionInput
  extends Omit<TransactionRecord, "id" | "created_at" | "amount" | "amount_unit" | "note"> {
  amount?: CanonicalAmount | null;
  note?: string | null;
}

export class TransactionsRepository {
  private readonly supabase: SupabaseLite;
  private readonly provider: RpcProvider;

  constructor(supabase: SupabaseLite, provider: RpcProvider) {
    this.supabase = supabase;
    this.provider = provider;
  }

  async save(input: SaveTransactionInput): Promise<TransactionRecord | null> {
    const { amount, note, ...rest } = input;
    const record: Omit<TransactionRecord, "id" | "created_at"> = {
      ...rest,
      amount: amount?.value ?? null,
      amount_unit: amount?.unit ?? null,
      note: note ?? amount?.display ?? null,
    };
    return saveTransaction(record, this.supabase);
  }

  async updateStatus(
    txHash: string,
    status: TransactionStatus,
    errorMessage?: string,
    fee?: string,
  ): Promise<void> {
    await updateTransactionStatus(
      txHash,
      status,
      errorMessage,
      fee,
      this.supabase,
    );
  }

  async listByWallet(walletAddress: string, limit = 100): Promise<TransactionRecord[]> {
    return getTransactions(walletAddress, limit, this.supabase);
  }

  async confirm(txHash: string): Promise<void> {
    await confirmTransaction(this.provider, txHash, this.supabase);
  }
}
