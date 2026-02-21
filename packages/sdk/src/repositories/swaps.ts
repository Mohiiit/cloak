import type { SupabaseLite } from "../supabase";
import {
  getSwapExecutions,
  saveSwapExecution,
  updateSwapExecution,
  type SwapExecutionRecord,
  type SwapExecutionStatus,
} from "../swaps";

export interface SaveSwapExecutionInput
  extends Omit<SwapExecutionRecord, "id" | "created_at" | "updated_at"> {}

export class SwapsRepository {
  private readonly supabase: SupabaseLite;

  constructor(supabase: SupabaseLite) {
    this.supabase = supabase;
  }

  async save(record: SaveSwapExecutionInput): Promise<SwapExecutionRecord | null> {
    return saveSwapExecution(record, this.supabase);
  }

  async update(
    txHash: string,
    update: Partial<
      Omit<SwapExecutionRecord, "id" | "wallet_address" | "tx_hash" | "created_at">
    >,
  ): Promise<void> {
    return updateSwapExecution(txHash, update, this.supabase);
  }

  async updateStatus(
    txHash: string,
    status: SwapExecutionStatus,
    errorMessage?: string,
    buyActualAmountWei?: string,
  ): Promise<void> {
    return updateSwapExecution(
      txHash,
      {
        status,
        error_message: errorMessage,
        buy_actual_amount_wei: buyActualAmountWei,
      },
      this.supabase,
    );
  }

  async listByWallet(walletAddress: string, limit = 100): Promise<SwapExecutionRecord[]> {
    return getSwapExecutions(walletAddress, limit, this.supabase);
  }
}
