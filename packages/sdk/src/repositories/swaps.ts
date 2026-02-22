import type { SupabaseLite } from "../supabase";
import {
  getSwapExecutionSteps,
  getSwapExecutions,
  saveSwapExecution,
  upsertSwapExecutionStep,
  updateSwapExecution,
  updateSwapExecutionByExecutionId,
  type SwapExecutionRecord,
  type SwapExecutionStepKey,
  type SwapExecutionStepRecord,
  type SwapExecutionStepStatus,
  type SwapExecutionStatus,
} from "../swaps";

export interface SaveSwapExecutionInput
  extends Omit<SwapExecutionRecord, "id" | "created_at" | "updated_at"> {}
export interface UpsertSwapExecutionStepInput
  extends Omit<SwapExecutionStepRecord, "id" | "created_at" | "updated_at"> {}

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
      Omit<SwapExecutionRecord, "id" | "wallet_address" | "tx_hash" | "execution_id" | "created_at">
    >,
  ): Promise<void> {
    return updateSwapExecution(txHash, update, this.supabase);
  }

  async updateByExecutionId(
    executionId: string,
    update: Partial<Omit<SwapExecutionRecord, "id" | "wallet_address" | "execution_id" | "created_at">>,
  ): Promise<void> {
    return updateSwapExecutionByExecutionId(executionId, update, this.supabase);
  }

  async updateStatus(
    executionId: string,
    status: SwapExecutionStatus,
    errorMessage?: string,
    buyActualAmountWei?: string,
    failureStepKey?: SwapExecutionStepKey,
  ): Promise<void> {
    return updateSwapExecutionByExecutionId(
      executionId,
      {
        status,
        error_message: errorMessage,
        buy_actual_amount_wei: buyActualAmountWei,
        failure_step_key: failureStepKey || null,
        failure_reason: errorMessage || null,
      },
      this.supabase,
    );
  }

  async listByWallet(walletAddress: string, limit = 100): Promise<SwapExecutionRecord[]> {
    return getSwapExecutions(walletAddress, limit, this.supabase);
  }

  async listSteps(executionIds: string[]): Promise<SwapExecutionStepRecord[]> {
    return getSwapExecutionSteps(executionIds, this.supabase);
  }

  async upsertStep(step: UpsertSwapExecutionStepInput): Promise<SwapExecutionStepRecord | null> {
    return upsertSwapExecutionStep(step, this.supabase);
  }

  async updateStepStatus(
    executionId: string,
    stepKey: SwapExecutionStepKey,
    status: SwapExecutionStepStatus,
    input?: {
      stepOrder?: number;
      txHash?: string | null;
      message?: string | null;
      metadata?: Record<string, unknown> | null;
      attempt?: number;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ): Promise<SwapExecutionStepRecord | null> {
    const now = new Date().toISOString();
    return this.upsertStep({
      execution_id: executionId,
      step_key: stepKey,
      step_order: input?.stepOrder ?? 0,
      attempt: input?.attempt ?? 1,
      status,
      tx_hash: input?.txHash ?? null,
      message: input?.message ?? null,
      metadata: input?.metadata ?? null,
      started_at:
        input?.startedAt === undefined
          ? status === "running"
            ? now
            : null
          : input.startedAt,
      finished_at:
        input?.finishedAt === undefined
          ? status === "success" || status === "failed" || status === "skipped"
            ? now
            : null
          : input.finishedAt,
    });
  }
}
