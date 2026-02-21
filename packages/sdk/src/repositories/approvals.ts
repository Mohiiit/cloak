import type { SupabaseLite } from "../supabase";
import {
  request2FAApproval,
  type TwoFAApprovalParams,
  type TwoFAApprovalResult,
} from "../two-factor";
import {
  createWardApprovalRequest,
  getWardApprovalRequestById,
  updateWardApprovalRequest,
  listWardApprovalRequestsForGuardian,
  listWardApprovalRequestsForWard,
  toWardApprovalUiModel,
  requestWardApproval,
  type WardApprovalParams,
  type WardApprovalResult,
  type WardApprovalRequestOptions,
  type WardApprovalRequest,
  type WardApprovalUpdate,
  type WardApprovalStatus,
  type WardApprovalUiModel,
} from "../ward";

export type TwoFactorRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "expired";

export type WardRequestStatus =
  | "pending_ward_sig"
  | "pending_guardian"
  | "approved"
  | "rejected"
  | "failed";

export interface ApprovalPollOptions {
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}

export interface WardApprovalPollOptions extends ApprovalPollOptions {
  requestOptions?: WardApprovalRequestOptions;
}

export class ApprovalsRepository {
  private readonly supabase: SupabaseLite;

  constructor(supabase: SupabaseLite) {
    this.supabase = supabase;
  }

  async requestTwoFactor(
    params: TwoFAApprovalParams,
    options: ApprovalPollOptions = {},
  ): Promise<TwoFAApprovalResult> {
    return request2FAApproval(
      this.supabase,
      params,
      options.onStatusChange,
      options.signal,
    );
  }

  async requestWard(
    params: WardApprovalParams,
    options: WardApprovalPollOptions = {},
  ): Promise<WardApprovalResult> {
    return requestWardApproval(
      this.supabase,
      params,
      options.onStatusChange,
      options.signal,
      options.requestOptions,
    );
  }

  async createWardRequest(
    params: WardApprovalParams,
    options?: WardApprovalRequestOptions,
  ): Promise<WardApprovalRequest> {
    return createWardApprovalRequest(this.supabase, params, options);
  }

  async getWardRequest(requestId: string): Promise<WardApprovalRequest | null> {
    return getWardApprovalRequestById(this.supabase, requestId);
  }

  async updateWardRequest(
    requestId: string,
    update: WardApprovalUpdate,
  ): Promise<WardApprovalRequest | null> {
    return updateWardApprovalRequest(this.supabase, requestId, update);
  }

  async listGuardianWardRequests(
    guardianAddress: string,
    statuses?: WardApprovalStatus[],
    limit?: number,
  ): Promise<WardApprovalRequest[]> {
    return listWardApprovalRequestsForGuardian(this.supabase, guardianAddress, statuses, limit);
  }

  async listWardRequests(
    wardAddress: string,
    statuses?: WardApprovalStatus[],
    limit?: number,
  ): Promise<WardApprovalRequest[]> {
    return listWardApprovalRequestsForWard(this.supabase, wardAddress, statuses, limit);
  }

  toWardRequestView(request: WardApprovalRequest): WardApprovalUiModel {
    return toWardApprovalUiModel(request);
  }
}
