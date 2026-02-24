/**
 * CloakApiClient — Typed HTTP client for the Cloak Backend API.
 *
 * All frontends (web, extension, mobile) use this instead of SupabaseLite
 * to communicate with the centralized backend.
 */

import type {
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthVerifyResponse,
  TwoFactorStatusResponse,
  TwoFactorEnableRequest,
  CreateApprovalRequest,
  ApprovalResponse,
  UpdateApprovalRequest,
  CreateWardConfigRequest,
  WardConfigResponse,
  UpdateWardConfigRequest,
  CreateWardApprovalRequest,
  WardApprovalResponse,
  UpdateWardApprovalRequest,
  SaveTransactionRequest,
  TransactionResponse,
  UpdateTransactionRequest,
  SaveSwapRequest,
  SwapResponse,
  UpdateSwapRequest,
  UpsertSwapStepRequest,
  SwapStepResponse,
  ActivityListResponse,
  PushRegisterRequest,
  CreateViewingGrantRequest,
  ViewingGrantResponse,
  CreateInnocenceProofRequest,
  InnocenceProofResponse,
  ApiError,
  PaginationParams,
} from "./types/api";

export class CloakApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let errorBody: ApiError;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = { error: `HTTP ${res.status} ${res.statusText}` };
      }
      throw new CloakApiError(
        errorBody.error || `Request failed: ${res.status}`,
        res.status,
        errorBody.code,
      );
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    return res.json();
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  private del<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, body);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queryString(params: any): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      }
    }
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  async register(req: AuthRegisterRequest): Promise<AuthRegisterResponse> {
    return this.post<AuthRegisterResponse>("/auth/register", req);
  }

  async verify(): Promise<AuthVerifyResponse> {
    return this.get<AuthVerifyResponse>("/auth/verify");
  }

  // ─── Two-Factor ──────────────────────────────────────────────────────────

  async getTwoFactorStatus(wallet: string): Promise<TwoFactorStatusResponse> {
    return this.get<TwoFactorStatusResponse>(
      `/two-factor/status${this.queryString({ wallet })}`,
    );
  }

  async enableTwoFactor(req: TwoFactorEnableRequest): Promise<void> {
    return this.post("/two-factor/enable", req);
  }

  async disableTwoFactor(wallet: string): Promise<void> {
    return this.del("/two-factor/disable", { wallet_address: wallet });
  }

  // ─── Approval Requests (2FA) ─────────────────────────────────────────────

  async createApproval(req: CreateApprovalRequest): Promise<ApprovalResponse> {
    return this.post<ApprovalResponse>("/approvals", req);
  }

  async getApproval(id: string): Promise<ApprovalResponse> {
    return this.get<ApprovalResponse>(`/approvals/${id}`);
  }

  async getPendingApprovals(wallet: string): Promise<ApprovalResponse[]> {
    return this.get<ApprovalResponse[]>(
      `/approvals${this.queryString({ wallet, status: "pending" })}`,
    );
  }

  async updateApproval(id: string, update: UpdateApprovalRequest): Promise<void> {
    return this.patch(`/approvals/${id}`, update);
  }

  // ─── Wards ───────────────────────────────────────────────────────────────

  async createWardConfig(req: CreateWardConfigRequest): Promise<WardConfigResponse> {
    return this.post<WardConfigResponse>("/wards", req);
  }

  async listWards(guardian: string): Promise<WardConfigResponse[]> {
    return this.get<WardConfigResponse[]>(
      `/wards${this.queryString({ guardian })}`,
    );
  }

  async getWard(address: string): Promise<WardConfigResponse> {
    return this.get<WardConfigResponse>(`/wards/${address}`);
  }

  async updateWard(address: string, update: UpdateWardConfigRequest): Promise<void> {
    return this.patch(`/wards/${address}`, update);
  }

  // ─── Ward Approvals ──────────────────────────────────────────────────────

  async createWardApproval(
    req: CreateWardApprovalRequest,
  ): Promise<WardApprovalResponse> {
    return this.post<WardApprovalResponse>("/ward-approvals", req);
  }

  async getWardApproval(id: string): Promise<WardApprovalResponse> {
    return this.get<WardApprovalResponse>(`/ward-approvals/${id}`);
  }

  async getPendingWardApprovals(params: {
    ward?: string;
    guardian?: string;
  }): Promise<WardApprovalResponse[]> {
    return this.get<WardApprovalResponse[]>(
      `/ward-approvals${this.queryString(params)}`,
    );
  }

  async getWardApprovalHistory(
    params: { ward?: string; guardian?: string } & PaginationParams,
  ): Promise<WardApprovalResponse[]> {
    return this.get<WardApprovalResponse[]>(
      `/ward-approvals/history${this.queryString(params)}`,
    );
  }

  async updateWardApproval(
    id: string,
    update: UpdateWardApprovalRequest,
  ): Promise<void> {
    return this.patch(`/ward-approvals/${id}`, update);
  }

  // ─── Transactions ────────────────────────────────────────────────────────

  async saveTransaction(req: SaveTransactionRequest): Promise<TransactionResponse> {
    return this.post<TransactionResponse>("/transactions", req);
  }

  async getTransactions(
    wallet: string,
    opts?: PaginationParams,
  ): Promise<TransactionResponse[]> {
    return this.get<TransactionResponse[]>(
      `/transactions${this.queryString({ wallet, ...opts })}`,
    );
  }

  async updateTransaction(
    txHash: string,
    update: UpdateTransactionRequest,
  ): Promise<void> {
    return this.patch(`/transactions/${encodeURIComponent(txHash)}`, update);
  }

  // ─── Swaps ───────────────────────────────────────────────────────────────

  async saveSwap(req: SaveSwapRequest): Promise<SwapResponse> {
    return this.post<SwapResponse>("/swaps", req);
  }

  async getSwaps(wallet: string, opts?: PaginationParams): Promise<SwapResponse[]> {
    return this.get<SwapResponse[]>(
      `/swaps${this.queryString({ wallet, ...opts })}`,
    );
  }

  async updateSwap(txHash: string, update: UpdateSwapRequest): Promise<void> {
    return this.patch(`/swaps/${encodeURIComponent(txHash)}`, update);
  }

  async updateSwapByExecutionId(
    executionId: string,
    update: UpdateSwapRequest,
  ): Promise<void> {
    return this.patch(
      `/swaps/by-execution/${encodeURIComponent(executionId)}`,
      update,
    );
  }

  async upsertSwapStep(step: UpsertSwapStepRequest): Promise<SwapStepResponse> {
    return this.post<SwapStepResponse>("/swaps/steps", step);
  }

  async getSwapSteps(executionIds: string[]): Promise<SwapStepResponse[]> {
    return this.get<SwapStepResponse[]>(
      `/swaps/steps${this.queryString({ execution_ids: executionIds.join(",") })}`,
    );
  }

  // ─── Activity ────────────────────────────────────────────────────────────

  async getActivity(
    wallet: string,
    opts?: PaginationParams,
  ): Promise<ActivityListResponse> {
    return this.get<ActivityListResponse>(
      `/activity${this.queryString({ wallet, ...opts })}`,
    );
  }

  // ─── Push Notifications ──────────────────────────────────────────────────

  async registerPush(req: PushRegisterRequest): Promise<void> {
    return this.post("/push/register", req);
  }

  async unregisterPush(deviceId: string): Promise<void> {
    return this.del("/push/unregister", { device_id: deviceId });
  }

  // ─── Compliance ──────────────────────────────────────────────────────────

  async createViewingGrant(
    req: CreateViewingGrantRequest,
  ): Promise<ViewingGrantResponse> {
    return this.post<ViewingGrantResponse>("/compliance/viewing-grants", req);
  }

  async listViewingGrants(params: {
    role: "owner" | "viewer";
    include_revoked?: boolean;
  }): Promise<ViewingGrantResponse[]> {
    return this.get<ViewingGrantResponse[]>(
      `/compliance/viewing-grants${this.queryString(params)}`,
    );
  }

  async revokeViewingGrant(id: string, reason?: string): Promise<void> {
    return this.patch(`/compliance/viewing-grants/${id}/revoke`, { reason });
  }

  async submitInnocenceProof(
    req: CreateInnocenceProofRequest,
  ): Promise<InnocenceProofResponse> {
    return this.post<InnocenceProofResponse>(
      "/compliance/innocence-proofs",
      req,
    );
  }

  async listInnocenceProofs(): Promise<InnocenceProofResponse[]> {
    return this.get<InnocenceProofResponse[]>("/compliance/innocence-proofs");
  }
}

export class CloakApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "CloakApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
