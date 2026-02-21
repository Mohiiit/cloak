import type { SupabaseLite } from "../supabase";
import {
  request2FAApproval,
  type TwoFAApprovalParams,
  type TwoFAApprovalResult,
} from "../two-factor";
import {
  requestWardApproval,
  type WardApprovalParams,
  type WardApprovalResult,
  type WardApprovalRequestOptions,
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
}
